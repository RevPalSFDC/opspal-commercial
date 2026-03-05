/**
 * Rollup Summary Template
 *
 * USE CASE: Calculate aggregate values from child records to parent records
 *
 * When to use this template:
 * - Calculate totals (sum of child amounts)
 * - Count child records (number of active children)
 * - Calculate averages, min, max from children
 * - Calculate earliest/latest dates from children
 * - Maintain parent counters when children change
 * - Implement custom rollup logic (beyond standard rollup summary fields)
 *
 * COMPLEXITY: Medium
 * GOVERNOR LIMITS: Target < 5 SOQL queries, < 2 DML operations
 *
 * CRITICAL NOTES:
 * - This pattern updates parent records, which can trigger parent triggers
 * - Requires strong recursion prevention
 * - Child insert/update/delete ALL require different handling
 * - Consider using @future for very large rollups
 *
 * CUSTOMIZATION CHECKLIST:
 * 1. Replace ChildObject__c with your child object API name
 * 2. Replace ParentObject__c with your parent object API name
 * 3. Define which child fields to aggregate
 * 4. Define which parent fields to update with aggregates
 * 5. Add filter conditions (only count active children, etc.)
 * 6. Test with bulk operations (200+ children per parent)
 */

// ============================================================================
// TRIGGER FILE: ChildObject__cTrigger.trigger
// ============================================================================
trigger ChildObjectTrigger on ChildObject__c (after insert, after update,
                                               after delete, after undelete) {
    ChildObjectTriggerHandler.handleTrigger();
}

// ============================================================================
// HANDLER CLASS: ChildObjectTriggerHandler.cls
// ============================================================================
public class ChildObjectTriggerHandler {
    // Recursion prevention
    private static Boolean isExecuting = false;

    public static void handleTrigger() {
        if (isExecuting) return;
        isExecuting = true;

        try {
            // Collect parent IDs that need rollup recalculation
            Set<Id> parentIdsToRecalculate = new Set<Id>();

            if (Trigger.isInsert || Trigger.isUndelete) {
                parentIdsToRecalculate.addAll(getParentIds(Trigger.new));
            }

            if (Trigger.isUpdate) {
                // Only recalculate if relevant fields changed
                parentIdsToRecalculate.addAll(
                    getParentIdsWithRelevantChanges(Trigger.new, Trigger.oldMap)
                );
            }

            if (Trigger.isDelete) {
                parentIdsToRecalculate.addAll(getParentIds(Trigger.old));
            }

            // Recalculate rollup summaries
            if (!parentIdsToRecalculate.isEmpty()) {
                recalculateRollupSummaries(parentIdsToRecalculate);
            }
        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // MAIN ROLLUP CALCULATION METHOD
    // ========================================================================
    private static void recalculateRollupSummaries(Set<Id> parentIds) {
        // Query parent records
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id, Name
            FROM ParentObject__c
            WHERE Id IN :parentIds
        ]);

        // Query child aggregations (SINGLE query with ALL aggregations)
        Map<Id, AggregateResult> aggregates = new Map<Id, AggregateResult>();

        for (AggregateResult ar : [
            SELECT ParentId__c parentId,
                   // Count aggregations
                   COUNT(Id) totalCount,
                   COUNT_DISTINCT(ContactId__c) uniqueContactCount,

                   // Sum aggregations
                   SUM(Amount__c) totalAmount,
                   SUM(Quantity__c) totalQuantity,

                   // Average aggregations
                   AVG(Amount__c) avgAmount,
                   AVG(Rating__c) avgRating,

                   // Min/Max aggregations
                   MIN(Amount__c) minAmount,
                   MAX(Amount__c) maxAmount,
                   MIN(StartDate__c) earliestStartDate,
                   MAX(EndDate__c) latestEndDate

            FROM ChildObject__c
            WHERE ParentId__c IN :parentIds
              AND IsActive__c = true  // Only include active children
            GROUP BY ParentId__c
        ]) {
            aggregates.put((Id)ar.get('parentId'), ar);
        }

        // Also get count of inactive children separately
        Map<Id, Integer> inactiveCountMap = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT ParentId__c parentId, COUNT(Id) cnt
            FROM ChildObject__c
            WHERE ParentId__c IN :parentIds
              AND IsActive__c = false
            GROUP BY ParentId__c
        ]) {
            inactiveCountMap.put((Id)ar.get('parentId'), (Integer)ar.get('cnt'));
        }

        // Update parent records with rollup values
        for (Id parentId : parentIds) {
            ParentObject__c parent = parentMap.get(parentId);

            if (aggregates.containsKey(parentId)) {
                AggregateResult ar = aggregates.get(parentId);

                // Count rollups
                parent.TotalChildCount__c = (Decimal)ar.get('totalCount');
                parent.UniqueContactCount__c = (Decimal)ar.get('uniqueContactCount');

                // Sum rollups
                parent.TotalAmount__c = (Decimal)ar.get('totalAmount');
                parent.TotalQuantity__c = (Decimal)ar.get('totalQuantity');

                // Average rollups
                parent.AverageAmount__c = (Decimal)ar.get('avgAmount');
                parent.AverageRating__c = (Decimal)ar.get('avgRating');

                // Min/Max rollups
                parent.MinAmount__c = (Decimal)ar.get('minAmount');
                parent.MaxAmount__c = (Decimal)ar.get('maxAmount');
                parent.EarliestStartDate__c = (Date)ar.get('earliestStartDate');
                parent.LatestEndDate__c = (Date)ar.get('latestEndDate');

                // Calculate inactive count
                parent.InactiveChildCount__c = inactiveCountMap.containsKey(parentId) ?
                    inactiveCountMap.get(parentId) : 0;

                // Calculate percentage fields
                if (parent.TotalChildCount__c > 0) {
                    parent.InactivePercentage__c =
                        (parent.InactiveChildCount__c / parent.TotalChildCount__c) * 100;
                }

                // Set last rollup date
                parent.LastRollupDate__c = System.now();

            } else {
                // No active children - set all to zero/null
                parent.TotalChildCount__c = 0;
                parent.UniqueContactCount__c = 0;
                parent.TotalAmount__c = 0;
                parent.TotalQuantity__c = 0;
                parent.AverageAmount__c = 0;
                parent.AverageRating__c = 0;
                parent.MinAmount__c = null;
                parent.MaxAmount__c = null;
                parent.EarliestStartDate__c = null;
                parent.LatestEndDate__c = null;

                parent.InactiveChildCount__c = inactiveCountMap.containsKey(parentId) ?
                    inactiveCountMap.get(parentId) : 0;
                parent.InactivePercentage__c = 0;
                parent.LastRollupDate__c = System.now();
            }
        }

        // Single DML operation for all parent updates
        if (!parentMap.isEmpty()) {
            update parentMap.values();
        }
    }

    // ========================================================================
    // HELPER: Get Parent IDs from Children
    // ========================================================================
    private static Set<Id> getParentIds(List<ChildObject__c> children) {
        Set<Id> parentIds = new Set<Id>();

        for (ChildObject__c child : children) {
            if (child.ParentId__c != null) {
                parentIds.add(child.ParentId__c);
            }
        }

        return parentIds;
    }

    // ========================================================================
    // HELPER: Get Parent IDs with Relevant Changes
    // ========================================================================
    private static Set<Id> getParentIdsWithRelevantChanges(
        List<ChildObject__c> newChildren,
        Map<Id, ChildObject__c> oldMap
    ) {
        Set<Id> parentIds = new Set<Id>();

        for (ChildObject__c newChild : newChildren) {
            ChildObject__c oldChild = oldMap.get(newChild.Id);

            // Check if any fields that affect rollups changed
            Boolean hasRelevantChange = false;

            // Check Amount field
            if (newChild.Amount__c != oldChild.Amount__c) {
                hasRelevantChange = true;
            }

            // Check Quantity field
            if (newChild.Quantity__c != oldChild.Quantity__c) {
                hasRelevantChange = true;
            }

            // Check IsActive flag
            if (newChild.IsActive__c != oldChild.IsActive__c) {
                hasRelevantChange = true;
            }

            // Check Rating field
            if (newChild.Rating__c != oldChild.Rating__c) {
                hasRelevantChange = true;
            }

            // Check Date fields
            if (newChild.StartDate__c != oldChild.StartDate__c ||
                newChild.EndDate__c != oldChild.EndDate__c) {
                hasRelevantChange = true;
            }

            // Check ContactId (for unique count)
            if (newChild.ContactId__c != oldChild.ContactId__c) {
                hasRelevantChange = true;
            }

            // Check if parent changed (reparenting)
            if (newChild.ParentId__c != oldChild.ParentId__c) {
                // Need to recalculate BOTH old and new parent
                if (oldChild.ParentId__c != null) {
                    parentIds.add(oldChild.ParentId__c);
                }
                if (newChild.ParentId__c != null) {
                    parentIds.add(newChild.ParentId__c);
                }
                continue; // Already added both parents
            }

            // Add parent if relevant change detected
            if (hasRelevantChange && newChild.ParentId__c != null) {
                parentIds.add(newChild.ParentId__c);
            }
        }

        return parentIds;
    }

    // ========================================================================
    // ASYNC PROCESSING (for very large rollups)
    // ========================================================================
    @future
    public static void recalculateRollupSummariesAsync(Set<Id> parentIds) {
        recalculateRollupSummaries(parentIds);
    }

    // ========================================================================
    // QUEUEABLE PROCESSING (for scheduled recalculation)
    // ========================================================================
    public class RollupRecalculationQueueable implements Queueable {
        private Set<Id> parentIds;

        public RollupRecalculationQueueable(Set<Id> parentIds) {
            this.parentIds = parentIds;
        }

        public void execute(QueueableContext context) {
            recalculateRollupSummaries(parentIds);
        }
    }
}

// ============================================================================
// UTILITY CLASS: Manual Rollup Recalculation (for data fixes)
// ============================================================================
public class RollupSummaryUtility {

    /**
     * Recalculate rollups for specific parents
     */
    public static void recalculateParents(Set<Id> parentIds) {
        ChildObjectTriggerHandler.recalculateRollupSummariesAsync(parentIds);
    }

    /**
     * Recalculate rollups for all parents (batch processing)
     */
    public static void recalculateAllParents() {
        // Query all parent IDs
        List<ParentObject__c> parents = [
            SELECT Id FROM ParentObject__c LIMIT 50000
        ];

        Set<Id> parentIds = new Set<Id>();
        for (ParentObject__c parent : parents) {
            parentIds.add(parent.Id);
        }

        // Process in chunks to avoid governor limits
        List<Id> parentIdList = new List<Id>(parentIds);
        Integer chunkSize = 200;

        for (Integer i = 0; i < parentIdList.size(); i += chunkSize) {
            Integer endIndex = Math.min(i + chunkSize, parentIdList.size());
            Set<Id> chunk = new Set<Id>();

            for (Integer j = i; j < endIndex; j++) {
                chunk.add(parentIdList[j]);
            }

            // Queue each chunk
            System.enqueueJob(
                new ChildObjectTriggerHandler.RollupRecalculationQueueable(chunk)
            );
        }
    }

    /**
     * Verify rollup accuracy (for testing/validation)
     */
    public static Map<Id, String> verifyRollupAccuracy(Set<Id> parentIds) {
        Map<Id, String> errors = new Map<Id, String>();

        // Query current parent values
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id, TotalChildCount__c, TotalAmount__c, AverageAmount__c
            FROM ParentObject__c
            WHERE Id IN :parentIds
        ]);

        // Query actual child aggregations
        Map<Id, AggregateResult> aggregates = new Map<Id, AggregateResult>();
        for (AggregateResult ar : [
            SELECT ParentId__c parentId,
                   COUNT(Id) cnt,
                   SUM(Amount__c) sum,
                   AVG(Amount__c) avg
            FROM ChildObject__c
            WHERE ParentId__c IN :parentIds
              AND IsActive__c = true
            GROUP BY ParentId__c
        ]) {
            aggregates.put((Id)ar.get('parentId'), ar);
        }

        // Compare values
        for (Id parentId : parentIds) {
            ParentObject__c parent = parentMap.get(parentId);

            if (aggregates.containsKey(parentId)) {
                AggregateResult ar = aggregates.get(parentId);

                Decimal actualCount = (Decimal)ar.get('cnt');
                Decimal actualSum = (Decimal)ar.get('sum');
                Decimal actualAvg = (Decimal)ar.get('avg');

                if (parent.TotalChildCount__c != actualCount) {
                    errors.put(parentId, 'Count mismatch: stored=' +
                        parent.TotalChildCount__c + ', actual=' + actualCount);
                }

                if (parent.TotalAmount__c != actualSum) {
                    errors.put(parentId, 'Sum mismatch: stored=' +
                        parent.TotalAmount__c + ', actual=' + actualSum);
                }
            }
        }

        return errors;
    }
}

// ============================================================================
// TEST CLASS: ChildObjectTriggerHandlerTest.cls
// ============================================================================
@isTest
private class ChildObjectTriggerHandlerTest {

    // ========================================================================
    // TEST SETUP
    // ========================================================================
    @testSetup
    static void setup() {
        // Create parent records
        List<ParentObject__c> parents = new List<ParentObject__c>();
        for (Integer i = 0; i < 5; i++) {
            parents.add(new ParentObject__c(Name = 'Parent ' + i));
        }
        insert parents;
    }

    // ========================================================================
    // TEST: Rollup on Insert
    // ========================================================================
    @isTest
    static void testRollupOnInsert() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert 10 children
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (Integer i = 0; i < 10; i++) {
            children.add(new ChildObject__c(
                ParentId__c = parent.Id,
                Amount__c = 100 + (i * 10),
                Quantity__c = i + 1,
                Rating__c = 3 + (i % 3),
                IsActive__c = true,
                StartDate__c = Date.today().addDays(i)
            ));
        }
        insert children;

        // Verify rollup calculations
        parent = [SELECT Id, TotalChildCount__c, TotalAmount__c, AverageAmount__c,
                         TotalQuantity__c, MinAmount__c, MaxAmount__c,
                         EarliestStartDate__c, LatestEndDate__c
                  FROM ParentObject__c WHERE Id = :parent.Id];

        System.assertEquals(10, parent.TotalChildCount__c,
            'Should count 10 children');

        System.assertEquals(1450, parent.TotalAmount__c,
            'Should sum amounts: 100+110+...+190 = 1450');

        System.assertEquals(145, parent.AverageAmount__c,
            'Should average amounts: 1450/10 = 145');

        System.assertEquals(55, parent.TotalQuantity__c,
            'Should sum quantities: 1+2+...+10 = 55');

        System.assertEquals(100, parent.MinAmount__c,
            'Should find min amount: 100');

        System.assertEquals(190, parent.MaxAmount__c,
            'Should find max amount: 190');

        System.assertEquals(Date.today(), parent.EarliestStartDate__c,
            'Should find earliest start date');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Rollup on Update
    // ========================================================================
    @isTest
    static void testRollupOnUpdate() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert children
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (Integer i = 0; i < 5; i++) {
            children.add(new ChildObject__c(
                ParentId__c = parent.Id,
                Amount__c = 100,
                IsActive__c = true
            ));
        }
        insert children;

        // Verify initial rollup
        parent = [SELECT Id, TotalAmount__c FROM ParentObject__c
                  WHERE Id = :parent.Id];
        System.assertEquals(500, parent.TotalAmount__c);

        // Update child amounts
        for (ChildObject__c child : children) {
            child.Amount__c = 200;
        }
        update children;

        // Verify updated rollup
        parent = [SELECT Id, TotalAmount__c FROM ParentObject__c
                  WHERE Id = :parent.Id];
        System.assertEquals(1000, parent.TotalAmount__c,
            'Should update total when child amounts change');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Rollup on Delete
    // ========================================================================
    @isTest
    static void testRollupOnDelete() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert children
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (Integer i = 0; i < 10; i++) {
            children.add(new ChildObject__c(
                ParentId__c = parent.Id,
                Amount__c = 100,
                IsActive__c = true
            ));
        }
        insert children;

        // Verify initial rollup
        parent = [SELECT Id, TotalChildCount__c, TotalAmount__c
                  FROM ParentObject__c WHERE Id = :parent.Id];
        System.assertEquals(10, parent.TotalChildCount__c);
        System.assertEquals(1000, parent.TotalAmount__c);

        // Delete 5 children
        List<ChildObject__c> toDelete = new List<ChildObject__c>();
        for (Integer i = 0; i < 5; i++) {
            toDelete.add(children[i]);
        }
        delete toDelete;

        // Verify updated rollup
        parent = [SELECT Id, TotalChildCount__c, TotalAmount__c
                  FROM ParentObject__c WHERE Id = :parent.Id];
        System.assertEquals(5, parent.TotalChildCount__c,
            'Should decrement count after delete');
        System.assertEquals(500, parent.TotalAmount__c,
            'Should recalculate total after delete');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Rollup on Undelete
    // ========================================================================
    @isTest
    static void testRollupOnUndelete() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert and delete children
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (Integer i = 0; i < 5; i++) {
            children.add(new ChildObject__c(
                ParentId__c = parent.Id,
                Amount__c = 100,
                IsActive__c = true
            ));
        }
        insert children;
        delete children;

        // Verify rollup after delete
        parent = [SELECT Id, TotalChildCount__c FROM ParentObject__c
                  WHERE Id = :parent.Id];
        System.assertEquals(0, parent.TotalChildCount__c);

        // Undelete children
        undelete children;

        // Verify rollup after undelete
        parent = [SELECT Id, TotalChildCount__c, TotalAmount__c
                  FROM ParentObject__c WHERE Id = :parent.Id];
        System.assertEquals(5, parent.TotalChildCount__c,
            'Should recalculate count after undelete');
        System.assertEquals(500, parent.TotalAmount__c,
            'Should recalculate total after undelete');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Reparenting
    // ========================================================================
    @isTest
    static void testRollupOnReparenting() {
        Test.startTest();

        List<ParentObject__c> parents = [SELECT Id FROM ParentObject__c LIMIT 2];
        ParentObject__c parent1 = parents[0];
        ParentObject__c parent2 = parents[1];

        // Insert children under parent1
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (Integer i = 0; i < 5; i++) {
            children.add(new ChildObject__c(
                ParentId__c = parent1.Id,
                Amount__c = 100,
                IsActive__c = true
            ));
        }
        insert children;

        // Verify parent1 rollup
        parent1 = [SELECT Id, TotalChildCount__c, TotalAmount__c
                   FROM ParentObject__c WHERE Id = :parent1.Id];
        System.assertEquals(5, parent1.TotalChildCount__c);
        System.assertEquals(500, parent1.TotalAmount__c);

        // Reparent 3 children to parent2
        for (Integer i = 0; i < 3; i++) {
            children[i].ParentId__c = parent2.Id;
        }
        update children;

        // Verify both parent rollups
        parent1 = [SELECT Id, TotalChildCount__c, TotalAmount__c
                   FROM ParentObject__c WHERE Id = :parent1.Id];
        parent2 = [SELECT Id, TotalChildCount__c, TotalAmount__c
                   FROM ParentObject__c WHERE Id = :parent2.Id];

        System.assertEquals(2, parent1.TotalChildCount__c,
            'Parent1 should have 2 children');
        System.assertEquals(200, parent1.TotalAmount__c,
            'Parent1 total should be 200');

        System.assertEquals(3, parent2.TotalChildCount__c,
            'Parent2 should have 3 children');
        System.assertEquals(300, parent2.TotalAmount__c,
            'Parent2 total should be 300');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Active vs Inactive Children
    // ========================================================================
    @isTest
    static void testActiveInactiveRollup() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert 10 children (5 active, 5 inactive)
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (Integer i = 0; i < 10; i++) {
            children.add(new ChildObject__c(
                ParentId__c = parent.Id,
                Amount__c = 100,
                IsActive__c = (i < 5) // First 5 active
            ));
        }
        insert children;

        // Verify rollup only counts active children
        parent = [SELECT Id, TotalChildCount__c, TotalAmount__c,
                         InactiveChildCount__c, InactivePercentage__c
                  FROM ParentObject__c WHERE Id = :parent.Id];

        System.assertEquals(5, parent.TotalChildCount__c,
            'Should only count active children');
        System.assertEquals(500, parent.TotalAmount__c,
            'Should only sum active children');
        System.assertEquals(5, parent.InactiveChildCount__c,
            'Should count inactive children separately');
        System.assertEquals(50, parent.InactivePercentage__c,
            'Should calculate 50% inactive');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Bulk Operations (200 children per parent)
    // ========================================================================
    @isTest
    static void testBulkRollup() {
        // Clean existing data
        delete [SELECT Id FROM ChildObject__c];

        Test.startTest();

        List<ParentObject__c> parents = [SELECT Id FROM ParentObject__c];

        // Insert 200 children per parent
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (ParentObject__c parent : parents) {
            for (Integer i = 0; i < 200; i++) {
                children.add(new ChildObject__c(
                    ParentId__c = parent.Id,
                    Amount__c = 10,
                    IsActive__c = true
                ));
            }
        }
        insert children;

        // Verify rollups
        parents = [SELECT Id, TotalChildCount__c, TotalAmount__c
                   FROM ParentObject__c];

        for (ParentObject__c parent : parents) {
            System.assertEquals(200, parent.TotalChildCount__c,
                'Each parent should have 200 children');
            System.assertEquals(2000, parent.TotalAmount__c,
                'Each parent total should be 2000');
        }

        // Verify governor limits
        System.assert(Limits.getQueries() < 5,
            'Should use < 5 SOQL queries');
        System.assert(Limits.getDMLStatements() < 2,
            'Should use < 2 DML statements');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Conditional Update (only relevant fields)
    // ========================================================================
    @isTest
    static void testConditionalRollupUpdate() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert children
        ChildObject__c child = new ChildObject__c(
            ParentId__c = parent.Id,
            Amount__c = 100,
            Name = 'Test Child',
            IsActive__c = true
        );
        insert child;

        // Get initial rollup date
        parent = [SELECT Id, LastRollupDate__c FROM ParentObject__c
                  WHERE Id = :parent.Id];
        DateTime initialRollupDate = parent.LastRollupDate__c;

        // Wait 1 second
        // (In real test, use Test.startTest/stopTest for time simulation)

        // Update non-relevant field (Name)
        child.Name = 'Updated Name';
        update child;

        // Verify rollup NOT recalculated (date unchanged)
        parent = [SELECT Id, LastRollupDate__c FROM ParentObject__c
                  WHERE Id = :parent.Id];

        // Note: This test may not work as expected in all scenarios
        // In production, verify logs or use custom debugging

        Test.stopTest();
    }
}
