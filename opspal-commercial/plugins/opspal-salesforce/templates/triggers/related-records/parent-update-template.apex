/**
 * Parent Update Template
 *
 * USE CASE: Update parent records when child records change (upward propagation)
 *
 * When to use this template:
 * - Update parent status based on child statuses (all complete → parent complete)
 * - Update parent dates based on child dates (earliest/latest)
 * - Update parent flags based on child flags (any child flagged → parent flagged)
 * - Trigger parent workflows based on child state changes
 * - Update parent completion percentage based on child progress
 * - Set parent priority based on highest child priority
 *
 * COMPLEXITY: Medium
 * GOVERNOR LIMITS: Target < 5 SOQL queries, < 2 DML operations
 *
 * CRITICAL NOTES:
 * - This pattern updates parent records, which may trigger parent triggers
 * - Requires strong recursion prevention
 * - Must query sibling records to determine parent state
 * - Consider performance impact with large child record sets
 *
 * CUSTOMIZATION CHECKLIST:
 * 1. Replace ChildObject__c with your child object API name
 * 2. Replace ParentObject__c with your parent object API name
 * 3. Define parent update logic based on child states
 * 4. Add conditional logic (only update parent if conditions met)
 * 5. Test with bulk operations and recursion scenarios
 */

// ============================================================================
// TRIGGER FILE: ChildObject__cTrigger.trigger
// ============================================================================
trigger ChildObjectTrigger on ChildObject__c (after insert, after update, after delete) {
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
            // Collect parent IDs that need updates
            Set<Id> parentIdsToUpdate = new Set<Id>();

            if (Trigger.isInsert) {
                parentIdsToUpdate.addAll(getParentIds(Trigger.new));
            }

            if (Trigger.isUpdate) {
                parentIdsToUpdate.addAll(
                    getParentIdsWithRelevantChanges(Trigger.new, Trigger.oldMap)
                );
            }

            if (Trigger.isDelete) {
                parentIdsToUpdate.addAll(getParentIds(Trigger.old));
            }

            // Update parent records
            if (!parentIdsToUpdate.isEmpty()) {
                updateParentRecords(parentIdsToUpdate);
            }
        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // MAIN PARENT UPDATE METHOD
    // ========================================================================
    private static void updateParentRecords(Set<Id> parentIds) {
        // Query parent records
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id, Name, Status__c, Priority__c, CompletionPercentage__c,
                   OverallStartDate__c, OverallEndDate__c, HasHighPriorityItems__c,
                   HasBlockedItems__c, AllItemsCompleted__c
            FROM ParentObject__c
            WHERE Id IN :parentIds
        ]);

        // Query ALL child records for these parents (SINGLE query)
        Map<Id, List<ChildObject__c>> parentToChildrenMap =
            new Map<Id, List<ChildObject__c>>();

        for (ChildObject__c child : [
            SELECT Id, ParentId__c, Status__c, Priority__c,
                   CompletionPercentage__c, StartDate__c, EndDate__c,
                   IsBlocked__c, IsHighRisk__c
            FROM ChildObject__c
            WHERE ParentId__c IN :parentIds
        ]) {
            if (!parentToChildrenMap.containsKey(child.ParentId__c)) {
                parentToChildrenMap.put(child.ParentId__c,
                    new List<ChildObject__c>());
            }
            parentToChildrenMap.get(child.ParentId__c).add(child);
        }

        // Update each parent based on its children
        for (Id parentId : parentIds) {
            ParentObject__c parent = parentMap.get(parentId);
            List<ChildObject__c> children = parentToChildrenMap.get(parentId);

            if (children != null && !children.isEmpty()) {
                updateParentStatus(parent, children);
                updateParentPriority(parent, children);
                updateParentCompletion(parent, children);
                updateParentDates(parent, children);
                updateParentFlags(parent, children);
            } else {
                // No children - set parent to default state
                parent.Status__c = 'Draft';
                parent.Priority__c = 'Low';
                parent.CompletionPercentage__c = 0;
                parent.AllItemsCompleted__c = false;
                parent.HasHighPriorityItems__c = false;
                parent.HasBlockedItems__c = false;
            }

            parent.LastChildUpdateDate__c = System.now();
        }

        // Single DML operation for all parent updates
        if (!parentMap.isEmpty()) {
            update parentMap.values();
        }
    }

    // ========================================================================
    // PATTERN 1: Update Parent Status Based on All Children
    // ========================================================================
    private static void updateParentStatus(ParentObject__c parent,
                                           List<ChildObject__c> children) {
        // Count children by status
        Integer totalCount = children.size();
        Integer completedCount = 0;
        Integer inProgressCount = 0;
        Integer blockedCount = 0;
        Integer notStartedCount = 0;

        for (ChildObject__c child : children) {
            if (child.Status__c == 'Completed') {
                completedCount++;
            } else if (child.Status__c == 'In Progress') {
                inProgressCount++;
            } else if (child.Status__c == 'Blocked') {
                blockedCount++;
            } else {
                notStartedCount++;
            }
        }

        // Determine parent status based on children
        if (completedCount == totalCount) {
            // All children complete → parent complete
            parent.Status__c = 'Completed';
            parent.AllItemsCompleted__c = true;
        } else if (blockedCount > 0) {
            // Any child blocked → parent on hold
            parent.Status__c = 'On Hold';
            parent.AllItemsCompleted__c = false;
        } else if (inProgressCount > 0) {
            // Some children in progress → parent in progress
            parent.Status__c = 'In Progress';
            parent.AllItemsCompleted__c = false;
        } else if (notStartedCount == totalCount) {
            // All children not started → parent not started
            parent.Status__c = 'Not Started';
            parent.AllItemsCompleted__c = false;
        } else {
            // Mixed states → parent in progress
            parent.Status__c = 'In Progress';
            parent.AllItemsCompleted__c = false;
        }
    }

    // ========================================================================
    // PATTERN 2: Update Parent Priority (Highest Child Priority)
    // ========================================================================
    private static void updateParentPriority(ParentObject__c parent,
                                             List<ChildObject__c> children) {
        // Priority ranking: Critical > High > Medium > Low
        Map<String, Integer> priorityRank = new Map<String, Integer>{
            'Critical' => 4,
            'High' => 3,
            'Medium' => 2,
            'Low' => 1
        };

        Integer highestRank = 0;
        String highestPriority = 'Low';
        Boolean hasHighPriority = false;

        for (ChildObject__c child : children) {
            if (child.Priority__c != null) {
                Integer rank = priorityRank.get(child.Priority__c);
                if (rank != null && rank > highestRank) {
                    highestRank = rank;
                    highestPriority = child.Priority__c;
                }

                // Flag if any child is high or critical
                if (child.Priority__c == 'High' ||
                    child.Priority__c == 'Critical') {
                    hasHighPriority = true;
                }
            }
        }

        parent.Priority__c = highestPriority;
        parent.HasHighPriorityItems__c = hasHighPriority;
    }

    // ========================================================================
    // PATTERN 3: Update Parent Completion Percentage
    // ========================================================================
    private static void updateParentCompletion(ParentObject__c parent,
                                               List<ChildObject__c> children) {
        Decimal totalCompletion = 0;
        Integer childCount = 0;

        for (ChildObject__c child : children) {
            if (child.CompletionPercentage__c != null) {
                totalCompletion += child.CompletionPercentage__c;
                childCount++;
            }
        }

        if (childCount > 0) {
            parent.CompletionPercentage__c = totalCompletion / childCount;
        } else {
            parent.CompletionPercentage__c = 0;
        }
    }

    // ========================================================================
    // PATTERN 4: Update Parent Dates (Earliest Start, Latest End)
    // ========================================================================
    private static void updateParentDates(ParentObject__c parent,
                                          List<ChildObject__c> children) {
        Date earliestStart = null;
        Date latestEnd = null;

        for (ChildObject__c child : children) {
            // Find earliest start date
            if (child.StartDate__c != null) {
                if (earliestStart == null ||
                    child.StartDate__c < earliestStart) {
                    earliestStart = child.StartDate__c;
                }
            }

            // Find latest end date
            if (child.EndDate__c != null) {
                if (latestEnd == null || child.EndDate__c > latestEnd) {
                    latestEnd = child.EndDate__c;
                }
            }
        }

        parent.OverallStartDate__c = earliestStart;
        parent.OverallEndDate__c = latestEnd;

        // Calculate overall duration
        if (earliestStart != null && latestEnd != null) {
            parent.OverallDurationDays__c =
                earliestStart.daysBetween(latestEnd);
        }
    }

    // ========================================================================
    // PATTERN 5: Update Parent Flags (Any Child Flagged → Parent Flagged)
    // ========================================================================
    private static void updateParentFlags(ParentObject__c parent,
                                          List<ChildObject__c> children) {
        Boolean hasBlocked = false;
        Boolean hasHighRisk = false;

        for (ChildObject__c child : children) {
            if (child.IsBlocked__c == true) {
                hasBlocked = true;
            }

            if (child.IsHighRisk__c == true) {
                hasHighRisk = true;
            }

            // Early exit if both flags found
            if (hasBlocked && hasHighRisk) {
                break;
            }
        }

        parent.HasBlockedItems__c = hasBlocked;
        parent.HasHighRiskItems__c = hasHighRisk;

        // Set overall risk level
        if (hasHighRisk) {
            parent.RiskLevel__c = 'High';
        } else if (hasBlocked) {
            parent.RiskLevel__c = 'Medium';
        } else {
            parent.RiskLevel__c = 'Low';
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

            // Check if any fields that affect parent changed
            Boolean hasRelevantChange = false;

            if (newChild.Status__c != oldChild.Status__c) {
                hasRelevantChange = true;
            }

            if (newChild.Priority__c != oldChild.Priority__c) {
                hasRelevantChange = true;
            }

            if (newChild.CompletionPercentage__c !=
                oldChild.CompletionPercentage__c) {
                hasRelevantChange = true;
            }

            if (newChild.StartDate__c != oldChild.StartDate__c ||
                newChild.EndDate__c != oldChild.EndDate__c) {
                hasRelevantChange = true;
            }

            if (newChild.IsBlocked__c != oldChild.IsBlocked__c ||
                newChild.IsHighRisk__c != oldChild.IsHighRisk__c) {
                hasRelevantChange = true;
            }

            // Check if parent changed (reparenting)
            if (newChild.ParentId__c != oldChild.ParentId__c) {
                // Update BOTH old and new parent
                if (oldChild.ParentId__c != null) {
                    parentIds.add(oldChild.ParentId__c);
                }
                if (newChild.ParentId__c != null) {
                    parentIds.add(newChild.ParentId__c);
                }
                continue;
            }

            if (hasRelevantChange && newChild.ParentId__c != null) {
                parentIds.add(newChild.ParentId__c);
            }
        }

        return parentIds;
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
            parents.add(new ParentObject__c(
                Name = 'Parent ' + i,
                Status__c = 'Draft',
                Priority__c = 'Low',
                CompletionPercentage__c = 0
            ));
        }
        insert parents;
    }

    // ========================================================================
    // TEST: Parent Status Update (All Children Complete)
    // ========================================================================
    @isTest
    static void testParentStatusAllComplete() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert 5 completed children
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (Integer i = 0; i < 5; i++) {
            children.add(new ChildObject__c(
                ParentId__c = parent.Id,
                Status__c = 'Completed',
                CompletionPercentage__c = 100
            ));
        }
        insert children;

        // Verify parent status updated
        parent = [SELECT Id, Status__c, AllItemsCompleted__c,
                         CompletionPercentage__c
                  FROM ParentObject__c WHERE Id = :parent.Id];

        System.assertEquals('Completed', parent.Status__c,
            'Parent should be completed when all children complete');
        System.assertEquals(true, parent.AllItemsCompleted__c);
        System.assertEquals(100, parent.CompletionPercentage__c);

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Parent Status Update (Mixed Children)
    // ========================================================================
    @isTest
    static void testParentStatusMixed() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert mixed status children
        List<ChildObject__c> children = new List<ChildObject__c>();
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            Status__c = 'Completed',
            CompletionPercentage__c = 100
        ));
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            Status__c = 'In Progress',
            CompletionPercentage__c = 50
        ));
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            Status__c = 'Not Started',
            CompletionPercentage__c = 0
        ));
        insert children;

        // Verify parent status
        parent = [SELECT Id, Status__c, CompletionPercentage__c
                  FROM ParentObject__c WHERE Id = :parent.Id];

        System.assertEquals('In Progress', parent.Status__c,
            'Parent should be in progress with mixed children');
        System.assertEquals(50, parent.CompletionPercentage__c,
            'Completion should be average: (100+50+0)/3 = 50');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Parent Status Update (Any Child Blocked)
    // ========================================================================
    @isTest
    static void testParentStatusBlocked() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert children with one blocked
        List<ChildObject__c> children = new List<ChildObject__c>();
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            Status__c = 'In Progress',
            IsBlocked__c = false
        ));
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            Status__c = 'Blocked',
            IsBlocked__c = true
        ));
        insert children;

        // Verify parent status
        parent = [SELECT Id, Status__c, HasBlockedItems__c
                  FROM ParentObject__c WHERE Id = :parent.Id];

        System.assertEquals('On Hold', parent.Status__c,
            'Parent should be on hold when any child is blocked');
        System.assertEquals(true, parent.HasBlockedItems__c);

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Parent Priority Update (Highest Child Priority)
    // ========================================================================
    @isTest
    static void testParentPriorityUpdate() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert children with varying priorities
        List<ChildObject__c> children = new List<ChildObject__c>();
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            Priority__c = 'Low'
        ));
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            Priority__c = 'Critical'
        ));
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            Priority__c = 'Medium'
        ));
        insert children;

        // Verify parent priority
        parent = [SELECT Id, Priority__c, HasHighPriorityItems__c
                  FROM ParentObject__c WHERE Id = :parent.Id];

        System.assertEquals('Critical', parent.Priority__c,
            'Parent priority should be highest child priority');
        System.assertEquals(true, parent.HasHighPriorityItems__c);

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Parent Date Update (Earliest/Latest)
    // ========================================================================
    @isTest
    static void testParentDateUpdate() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert children with different dates
        List<ChildObject__c> children = new List<ChildObject__c>();
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            StartDate__c = Date.today().addDays(5),
            EndDate__c = Date.today().addDays(10)
        ));
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            StartDate__c = Date.today(), // Earliest
            EndDate__c = Date.today().addDays(15)
        ));
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            StartDate__c = Date.today().addDays(3),
            EndDate__c = Date.today().addDays(20) // Latest
        ));
        insert children;

        // Verify parent dates
        parent = [SELECT Id, OverallStartDate__c, OverallEndDate__c,
                         OverallDurationDays__c
                  FROM ParentObject__c WHERE Id = :parent.Id];

        System.assertEquals(Date.today(), parent.OverallStartDate__c,
            'Should use earliest child start date');
        System.assertEquals(Date.today().addDays(20), parent.OverallEndDate__c,
            'Should use latest child end date');
        System.assertEquals(20, parent.OverallDurationDays__c,
            'Should calculate duration from earliest to latest');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Parent Flags Update
    // ========================================================================
    @isTest
    static void testParentFlagsUpdate() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert children with flags
        List<ChildObject__c> children = new List<ChildObject__c>();
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            IsBlocked__c = false,
            IsHighRisk__c = false
        ));
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            IsBlocked__c = true,
            IsHighRisk__c = false
        ));
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            IsBlocked__c = false,
            IsHighRisk__c = true
        ));
        insert children;

        // Verify parent flags
        parent = [SELECT Id, HasBlockedItems__c, HasHighRiskItems__c,
                         RiskLevel__c
                  FROM ParentObject__c WHERE Id = :parent.Id];

        System.assertEquals(true, parent.HasBlockedItems__c,
            'Should flag if any child is blocked');
        System.assertEquals(true, parent.HasHighRiskItems__c,
            'Should flag if any child is high risk');
        System.assertEquals('High', parent.RiskLevel__c,
            'Risk level should be High when any child is high risk');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Parent Update on Child Update
    // ========================================================================
    @isTest
    static void testParentUpdateOnChildUpdate() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert child
        ChildObject__c child = new ChildObject__c(
            ParentId__c = parent.Id,
            Status__c = 'Not Started',
            Priority__c = 'Low'
        );
        insert child;

        // Verify initial parent state
        parent = [SELECT Id, Status__c, Priority__c
                  FROM ParentObject__c WHERE Id = :parent.Id];
        System.assertEquals('Not Started', parent.Status__c);
        System.assertEquals('Low', parent.Priority__c);

        // Update child
        child.Status__c = 'In Progress';
        child.Priority__c = 'High';
        update child;

        // Verify parent updated
        parent = [SELECT Id, Status__c, Priority__c
                  FROM ParentObject__c WHERE Id = :parent.Id];
        System.assertEquals('In Progress', parent.Status__c);
        System.assertEquals('High', parent.Priority__c);

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Parent Update on Child Delete
    // ========================================================================
    @isTest
    static void testParentUpdateOnChildDelete() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert 2 children with different priorities
        List<ChildObject__c> children = new List<ChildObject__c>();
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            Priority__c = 'High'
        ));
        children.add(new ChildObject__c(
            ParentId__c = parent.Id,
            Priority__c = 'Low'
        ));
        insert children;

        // Verify parent has high priority
        parent = [SELECT Id, Priority__c FROM ParentObject__c
                  WHERE Id = :parent.Id];
        System.assertEquals('High', parent.Priority__c);

        // Delete high priority child
        delete children[0];

        // Verify parent priority updated
        parent = [SELECT Id, Priority__c FROM ParentObject__c
                  WHERE Id = :parent.Id];
        System.assertEquals('Low', parent.Priority__c,
            'Parent priority should update after high priority child deleted');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Bulk Operations (200 children)
    // ========================================================================
    @isTest
    static void testBulkOperations() {
        Test.startTest();

        List<ParentObject__c> parents = [SELECT Id FROM ParentObject__c];

        // Insert 40 children per parent (200 total)
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (ParentObject__c parent : parents) {
            for (Integer i = 0; i < 40; i++) {
                children.add(new ChildObject__c(
                    ParentId__c = parent.Id,
                    Status__c = 'Completed',
                    Priority__c = 'Medium',
                    CompletionPercentage__c = 100
                ));
            }
        }
        insert children;

        // Verify all parents updated
        parents = [SELECT Id, Status__c, Priority__c, CompletionPercentage__c
                   FROM ParentObject__c];

        for (ParentObject__c parent : parents) {
            System.assertEquals('Completed', parent.Status__c);
            System.assertEquals('Medium', parent.Priority__c);
            System.assertEquals(100, parent.CompletionPercentage__c);
        }

        // Verify governor limits
        System.assert(Limits.getQueries() < 5,
            'Should use < 5 SOQL queries');
        System.assert(Limits.getDMLStatements() < 2,
            'Should use < 2 DML statements');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Recursion Prevention
    // ========================================================================
    @isTest
    static void testRecursionPrevention() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        // Insert child
        ChildObject__c child = new ChildObject__c(
            ParentId__c = parent.Id,
            Status__c = 'Not Started'
        );
        insert child;

        // Update child multiple times rapidly
        for (Integer i = 0; i < 5; i++) {
            child.Status__c = (i % 2 == 0) ? 'In Progress' : 'Completed';
            update child;
        }

        System.assert(true, 'Should not hit recursion issues');

        Test.stopTest();
    }
}
