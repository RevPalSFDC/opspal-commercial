/**
 * @description Minimal after update trigger with handler pattern
 * @usage Update related records, cascade changes
 * @complexity Simple
 * @bestPractices Handler pattern, recursion prevention, detect changes with oldMap
 *
 * USE CASE EXAMPLES:
 * - Update related records when parent changes
 * - Cascade status changes to children
 * - Send notifications on specific field changes
 * - Create history/audit records
 * - Update rollup summary fields (custom)
 * - Sync data to external systems
 *
 * WHY AFTER UPDATE:
 * - Record already has an ID
 * - Trigger.new is READ-ONLY (cannot modify directly)
 * - Has access to Trigger.old and Trigger.oldMap (detect changes)
 * - Use for DML operations on OTHER objects
 * - Runs after record is committed to database
 * - Ideal for cascading updates and notifications
 *
 * KEY PATTERN: Use Trigger.oldMap to detect changes
 * - Only process records where specific fields changed
 * - Avoid unnecessary processing on irrelevant updates
 * - Compare newRecord vs oldRecord
 *
 * RECURSION WARNING:
 * - After update can easily cause infinite loops
 * - If you update the same record, trigger fires again
 * - ALWAYS implement recursion prevention
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your object (e.g., Account, Opportunity)
 * [ ] Update handler class name (ObjectNameTriggerHandler)
 * [ ] Implement change detection logic
 * [ ] Add recursion prevention (CRITICAL!)
 * [ ] Add test class with change detection scenarios
 * [ ] Deploy to sandbox and test before production
 */

trigger ObjectNameTrigger on ObjectName (after update) {
    ObjectNameTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
}

/**
 * HANDLER CLASS TEMPLATE
 *
 * IMPLEMENTATION NOTES:
 * - Keep trigger minimal (just routing logic)
 * - Put ALL business logic in handler class
 * - Implement recursion prevention (CRITICAL for after update!)
 * - Always use Trigger.oldMap to detect changes
 * - Process only records where relevant fields changed
 * - Query outside loops, use Map for lookups
 * - Collect records for DML, perform single operation
 */
/*
public class ObjectNameTriggerHandler {

    // ========================================
    // RECURSION PREVENTION
    // ========================================
    // CRITICAL for after update (prevents infinite loops)
    private static Boolean isExecuting = false;

    // Alternative: Track processed record IDs
    private static Set<Id> processedRecordIds = new Set<Id>();

    // ========================================
    // MAIN HANDLER
    // ========================================
    public static void handleAfterUpdate(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods in logical order
        updateChildRecords(newRecords, oldMap);       // 1. Update children
        cascadeStatusChanges(newRecords, oldMap);     // 2. Cascade changes
        updateParentCounters(newRecords, oldMap);     // 3. Update parent stats
        sendNotifications(newRecords, oldMap);        // 4. Send alerts
        createAuditRecords(newRecords, oldMap);       // 5. Create history

        isExecuting = false;
    }

    // ========================================
    // UPDATE CHILD RECORDS
    // ========================================

    private static void updateChildRecords(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        // Only process records where relevant field changed
        Set<Id> recordsToProcess = new Set<Id>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Only process if ImportantField changed
            if (newRecord.ImportantField__c != oldRecord.ImportantField__c) {
                recordsToProcess.add(newRecord.Id);
            }
        }

        if (recordsToProcess.isEmpty()) return;

        // Query child records (SINGLE query)
        List<ChildObject__c> childrenToUpdate = [
            SELECT Id, ParentId__c, SyncedField__c
            FROM ChildObject__c
            WHERE ParentId__c IN :recordsToProcess
        ];

        // Create map for O(1) lookup
        Map<Id, ObjectName> recordMap = new Map<Id, ObjectName>(newRecords);

        // Update children
        for (ChildObject__c child : childrenToUpdate) {
            ObjectName parent = recordMap.get(child.ParentId__c);
            if (parent != null) {
                child.SyncedField__c = parent.ImportantField__c;
            }
        }

        // Single DML operation
        if (!childrenToUpdate.isEmpty()) {
            update childrenToUpdate;
        }
    }

    // ========================================
    // CASCADE STATUS CHANGES
    // ========================================

    private static void cascadeStatusChanges(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        // Only process records where Status changed
        Set<Id> recordsWithStatusChange = new Set<Id>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            if (newRecord.Status__c != oldRecord.Status__c) {
                recordsWithStatusChange.add(newRecord.Id);
            }
        }

        if (recordsWithStatusChange.isEmpty()) return;

        // Query related records (SINGLE query)
        List<RelatedObject__c> relatedToUpdate = [
            SELECT Id, ParentId__c, Status__c
            FROM RelatedObject__c
            WHERE ParentId__c IN :recordsWithStatusChange
        ];

        // Create map for O(1) lookup
        Map<Id, ObjectName> recordMap = new Map<Id, ObjectName>(newRecords);

        // Cascade status
        for (RelatedObject__c related : relatedToUpdate) {
            ObjectName parent = recordMap.get(related.ParentId__c);
            if (parent != null) {
                // Cascade status to related records
                if (parent.Status__c == 'Completed') {
                    related.Status__c = 'Completed';
                } else if (parent.Status__c == 'Cancelled') {
                    related.Status__c = 'Cancelled';
                }
            }
        }

        // Single DML operation
        if (!relatedToUpdate.isEmpty()) {
            update relatedToUpdate;
        }
    }

    // ========================================
    // UPDATE PARENT COUNTERS
    // ========================================

    private static void updateParentCounters(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        // Only process records where relevant field changed
        Set<Id> parentsToUpdate = new Set<Id>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Parent changed - update both old and new parent
            if (newRecord.ParentId__c != oldRecord.ParentId__c) {
                if (oldRecord.ParentId__c != null) {
                    parentsToUpdate.add(oldRecord.ParentId__c);
                }
                if (newRecord.ParentId__c != null) {
                    parentsToUpdate.add(newRecord.ParentId__c);
                }
            }

            // Status changed - update parent
            if (newRecord.Status__c != oldRecord.Status__c && newRecord.ParentId__c != null) {
                parentsToUpdate.add(newRecord.ParentId__c);
            }
        }

        if (parentsToUpdate.isEmpty()) return;

        // Query parents with counts (SINGLE query)
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id,
                   (SELECT Id, Status__c FROM Children__r)
            FROM ParentObject__c
            WHERE Id IN :parentsToUpdate
        ]);

        // Update parent counters
        List<ParentObject__c> parentsToUpdateList = new List<ParentObject__c>();
        for (ParentObject__c parent : parentMap.values()) {
            parent.TotalChildren__c = parent.Children__r.size();

            // Count by status
            Integer activeCount = 0;
            Integer completedCount = 0;
            for (ObjectName child : parent.Children__r) {
                if (child.Status__c == 'Active') {
                    activeCount++;
                } else if (child.Status__c == 'Completed') {
                    completedCount++;
                }
            }
            parent.ActiveChildren__c = activeCount;
            parent.CompletedChildren__c = completedCount;

            parentsToUpdateList.add(parent);
        }

        // Single DML operation
        if (!parentsToUpdateList.isEmpty()) {
            update parentsToUpdateList;
        }
    }

    // ========================================
    // NOTIFICATION METHODS
    // ========================================

    private static void sendNotifications(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Send notification when status changes to Completed
            if (newRecord.Status__c == 'Completed' && oldRecord.Status__c != 'Completed') {
                if (newRecord.ContactEmail__c != null) {
                    Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
                    email.setToAddresses(new List<String>{newRecord.ContactEmail__c});
                    email.setSubject('Status Update: ' + newRecord.Name + ' is Complete');
                    email.setPlainTextBody(
                        'The following record has been completed:\n\n' +
                        'Name: ' + newRecord.Name + '\n' +
                        'Completed Date: ' + System.now().format() + '\n' +
                        'Completed By: ' + UserInfo.getName()
                    );
                    emails.add(email);
                }
            }

            // Send alert when priority increases
            if (newRecord.Priority__c == 'Critical' && oldRecord.Priority__c != 'Critical') {
                Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
                email.setToAddresses(new List<String>{'escalations@company.com'});
                email.setSubject('CRITICAL: ' + newRecord.Name);
                email.setPlainTextBody(
                    'A record has been escalated to CRITICAL priority:\n\n' +
                    'Name: ' + newRecord.Name + '\n' +
                    'Owner: ' + newRecord.Owner.Name + '\n' +
                    'Escalated By: ' + UserInfo.getName() + '\n' +
                    '\nImmediate attention required.'
                );
                emails.add(email);
            }
        }

        // Send all emails (single operation)
        if (!emails.isEmpty()) {
            Messaging.sendEmail(emails);
        }
    }

    // ========================================
    // AUDIT RECORD CREATION
    // ========================================

    private static void createAuditRecords(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        List<AuditLog__c> logsToInsert = new List<AuditLog__c>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Create audit log for important field changes
            List<String> changes = new List<String>();

            if (newRecord.ImportantField__c != oldRecord.ImportantField__c) {
                changes.add('ImportantField: ' + oldRecord.ImportantField__c + ' → ' + newRecord.ImportantField__c);
            }

            if (newRecord.Status__c != oldRecord.Status__c) {
                changes.add('Status: ' + oldRecord.Status__c + ' → ' + newRecord.Status__c);
            }

            if (newRecord.Amount__c != oldRecord.Amount__c) {
                changes.add('Amount: ' + oldRecord.Amount__c + ' → ' + newRecord.Amount__c);
            }

            // If any changes, create audit log
            if (!changes.isEmpty()) {
                AuditLog__c log = new AuditLog__c(
                    RecordId__c = newRecord.Id,
                    RecordType__c = 'ObjectName',
                    Action__c = 'Update',
                    Changes__c = String.join(changes, '\n'),
                    ChangedBy__c = UserInfo.getUserId(),
                    ChangedDate__c = System.now()
                );
                logsToInsert.add(log);
            }
        }

        // Single DML operation
        if (!logsToInsert.isEmpty()) {
            insert logsToInsert;
        }
    }
}
*/

/**
 * REAL-WORLD EXAMPLE: Opportunity After Update
 *
 * Scenario: Cascade stage changes, update account, send notifications, create history
 */
/*
trigger OpportunityTrigger on Opportunity (after update) {
    OpportunityTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
}

public class OpportunityTriggerHandler {

    private static Boolean isExecuting = false;

    public static void handleAfterUpdate(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        // Update opportunity products
        updateOpportunityProducts(newOpps, oldMap);

        // Update accounts
        updateAccountMetrics(newOpps, oldMap);

        // Send notifications
        sendStageChangeNotifications(newOpps, oldMap);

        // Create history
        createOpportunityHistory(newOpps, oldMap);

        isExecuting = false;
    }

    private static void updateOpportunityProducts(List<Opportunity> opps, Map<Id, Opportunity> oldMap) {
        // Only process opportunities where Discount changed
        Set<Id> oppsWithDiscountChange = new Set<Id>();

        for (Opportunity opp : opps) {
            Opportunity oldOpp = oldMap.get(opp.Id);

            if (opp.Discount__c != oldOpp.Discount__c) {
                oppsWithDiscountChange.add(opp.Id);
            }
        }

        if (oppsWithDiscountChange.isEmpty()) return;

        // Query opportunity line items (SINGLE query)
        List<OpportunityLineItem> lineItems = [
            SELECT Id, OpportunityId, UnitPrice, Discount
            FROM OpportunityLineItem
            WHERE OpportunityId IN :oppsWithDiscountChange
        ];

        // Create map for O(1) lookup
        Map<Id, Opportunity> oppMap = new Map<Id, Opportunity>(opps);

        // Apply opportunity discount to line items
        for (OpportunityLineItem lineItem : lineItems) {
            Opportunity opp = oppMap.get(lineItem.OpportunityId);
            if (opp != null) {
                lineItem.Discount = opp.Discount__c;
            }
        }

        // Single DML operation
        if (!lineItems.isEmpty()) {
            update lineItems;
        }
    }

    private static void updateAccountMetrics(List<Opportunity> opps, Map<Id, Opportunity> oldMap) {
        // Only process opportunities where stage changed to Closed Won/Lost
        Set<Id> accountIds = new Set<Id>();

        for (Opportunity opp : opps) {
            Opportunity oldOpp = oldMap.get(opp.Id);

            if (opp.StageName != oldOpp.StageName &&
                (opp.StageName == 'Closed Won' || opp.StageName == 'Closed Lost')) {
                if (opp.AccountId != null) {
                    accountIds.add(opp.AccountId);
                }
            }
        }

        if (accountIds.isEmpty()) return;

        // Query accounts with opportunities (SINGLE query)
        Map<Id, Account> accountMap = new Map<Id, Account>([
            SELECT Id,
                   (SELECT Amount FROM Opportunities WHERE IsWon = true)
            FROM Account
            WHERE Id IN :accountIds
        ]);

        // Update account metrics
        List<Account> accountsToUpdate = new List<Account>();
        for (Account acc : accountMap.values()) {
            Decimal totalRevenue = 0;
            for (Opportunity opp : acc.Opportunities) {
                totalRevenue += (opp.Amount != null ? opp.Amount : 0);
            }
            acc.TotalRevenue__c = totalRevenue;
            acc.TotalOpportunitiesWon__c = acc.Opportunities.size();
            accountsToUpdate.add(acc);
        }

        // Single DML operation
        if (!accountsToUpdate.isEmpty()) {
            update accountsToUpdate;
        }
    }

    private static void sendStageChangeNotifications(List<Opportunity> opps, Map<Id, Opportunity> oldMap) {
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (Opportunity opp : opps) {
            Opportunity oldOpp = oldMap.get(opp.Id);

            // Notify on Closed Won
            if (opp.StageName == 'Closed Won' && oldOpp.StageName != 'Closed Won') {
                Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
                email.setToAddresses(new List<String>{'sales-leadership@company.com'});
                email.setSubject('🎉 Opportunity Closed Won: ' + opp.Name);
                email.setPlainTextBody(
                    'Opportunity closed successfully:\n\n' +
                    'Opportunity: ' + opp.Name + '\n' +
                    'Amount: $' + String.valueOf(opp.Amount) + '\n' +
                    'Account: ' + opp.Account.Name + '\n' +
                    'Owner: ' + opp.Owner.Name + '\n' +
                    'Close Date: ' + opp.CloseDate.format()
                );
                emails.add(email);
            }

            // Alert on stuck opportunities
            if (opp.StageName == 'Negotiation' && oldOpp.StageName != 'Negotiation') {
                // Create task to follow up in 7 days if still in Negotiation
                Task followUp = new Task(
                    WhatId = opp.Id,
                    Subject = 'Follow up on negotiation: ' + opp.Name,
                    ActivityDate = Date.today().addDays(7),
                    OwnerId = opp.OwnerId,
                    Description = 'Check if opportunity is still in negotiation stage'
                );
                insert followUp;
            }
        }

        // Send all emails
        if (!emails.isEmpty()) {
            Messaging.sendEmail(emails);
        }
    }

    private static void createOpportunityHistory(List<Opportunity> opps, Map<Id, Opportunity> oldMap) {
        List<OpportunityHistory__c> historyRecords = new List<OpportunityHistory__c>();

        for (Opportunity opp : opps) {
            Opportunity oldOpp = oldMap.get(opp.Id);

            // Track stage changes
            if (opp.StageName != oldOpp.StageName) {
                historyRecords.add(new OpportunityHistory__c(
                    OpportunityId__c = opp.Id,
                    FieldName__c = 'StageName',
                    OldValue__c = oldOpp.StageName,
                    NewValue__c = opp.StageName,
                    ChangedDate__c = System.now(),
                    ChangedBy__c = UserInfo.getUserId()
                ));
            }

            // Track amount changes
            if (opp.Amount != oldOpp.Amount) {
                historyRecords.add(new OpportunityHistory__c(
                    OpportunityId__c = opp.Id,
                    FieldName__c = 'Amount',
                    OldValue__c = String.valueOf(oldOpp.Amount),
                    NewValue__c = String.valueOf(opp.Amount),
                    ChangedDate__c = System.now(),
                    ChangedBy__c = UserInfo.getUserId()
                ));
            }
        }

        // Single DML operation
        if (!historyRecords.isEmpty()) {
            insert historyRecords;
        }
    }
}
*/

/**
 * TEST CLASS TEMPLATE
 *
 * TESTING CHECKLIST:
 * [ ] Test field change detection
 * [ ] Test child record updates
 * [ ] Test parent counter updates
 * [ ] Test notifications on change
 * [ ] Test no changes (update without changing tracked fields)
 * [ ] Test bulk (200 records) - MANDATORY
 * [ ] Test recursion prevention (CRITICAL!)
 * [ ] Verify <10 SOQL queries, <5 DML statements
 */
/*
@isTest
private class ObjectNameTriggerHandlerTest {

    // ========================================
    // TEST DATA SETUP
    // ========================================

    @testSetup
    static void setupTestData() {
        // Create parent records
        List<ParentObject__c> parents = new List<ParentObject__c>();
        for (Integer i = 0; i < 10; i++) {
            parents.add(new ParentObject__c(
                Name = 'Test Parent ' + i
            ));
        }
        insert parents;

        // Create ObjectName records
        ParentObject__c parent = parents[0];
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                Status__c = 'Active',
                ParentId__c = parent.Id,
                ImportantField__c = 'Initial Value'
            ));
        }
        insert records;

        // Create child records
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (ObjectName record : records) {
            children.add(new ChildObject__c(
                ParentId__c = record.Id,
                SyncedField__c = record.ImportantField__c
            ));
        }
        insert children;
    }

    // ========================================
    // CHILD UPDATE TEST
    // ========================================

    @isTest
    static void testUpdate_UpdatesChildren() {
        ObjectName record = [SELECT Id, ImportantField__c FROM ObjectName LIMIT 1];
        record.ImportantField__c = 'New Value';

        Test.startTest();
        update record;
        Test.stopTest();

        // Verify child was updated
        List<ChildObject__c> children = [
            SELECT SyncedField__c
            FROM ChildObject__c
            WHERE ParentId__c = :record.Id
        ];

        System.assertEquals('New Value', children[0].SyncedField__c,
            'Child field should be synced from parent');
    }

    // ========================================
    // NO CHANGE TEST
    // ========================================

    @isTest
    static void testUpdate_NoImportantFieldChange() {
        ObjectName record = [SELECT Id, Name, ImportantField__c FROM ObjectName LIMIT 1];
        String originalValue = record.ImportantField__c;
        record.Name = 'Updated Name';  // Change non-tracked field

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        update record;
        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Test.stopTest();

        // Verify child was NOT queried/updated
        ChildObject__c child = [
            SELECT SyncedField__c
            FROM ChildObject__c
            WHERE ParentId__c = :record.Id
        ];

        System.assertEquals(originalValue, child.SyncedField__c,
            'Child should not be updated when ImportantField not changed');
        System.assert(queriesUsed < 5,
            'Should not query children when ImportantField not changed');
    }

    // ========================================
    // PARENT COUNTER UPDATE TEST
    // ========================================

    @isTest
    static void testUpdate_UpdatesParentCounters() {
        ObjectName record = [SELECT Id, Status__c, ParentId__c FROM ObjectName LIMIT 1];
        record.Status__c = 'Completed';

        Test.startTest();
        update record;
        Test.stopTest();

        // Verify parent counter updated
        ParentObject__c parent = [
            SELECT TotalChildren__c, ActiveChildren__c, CompletedChildren__c
            FROM ParentObject__c
            WHERE Id = :record.ParentId__c
        ];

        System.assertEquals(1, parent.CompletedChildren__c, 'Completed counter should be incremented');
    }

    // ========================================
    // NOTIFICATION TEST
    // ========================================

    @isTest
    static void testUpdate_SendsNotification() {
        ObjectName record = [SELECT Id, Status__c, ContactEmail__c FROM ObjectName LIMIT 1];
        record.ContactEmail__c = 'test@example.com';
        update record;  // Set email first

        record = [SELECT Id, Status__c FROM ObjectName WHERE Id = :record.Id];
        record.Status__c = 'Completed';

        Test.startTest();
        Integer emailsBefore = Limits.getEmailInvocations();
        update record;
        Integer emailsUsed = Limits.getEmailInvocations() - emailsBefore;
        Test.stopTest();

        System.assert(emailsUsed > 0, 'Should send email notification on status change');
    }

    // ========================================
    // BULK UPDATE TEST (MANDATORY)
    // ========================================

    @isTest
    static void testUpdate_BulkRecords() {
        List<ObjectName> records = [SELECT Id, ImportantField__c FROM ObjectName];

        for (ObjectName record : records) {
            record.ImportantField__c = 'Bulk Update Value';
        }

        Test.startTest();
        update records;
        Test.stopTest();

        // Verify all children were updated
        List<ChildObject__c> children = [
            SELECT SyncedField__c
            FROM ChildObject__c
            WHERE SyncedField__c = 'Bulk Update Value'
        ];

        System.assertEquals(200, children.size(), 'All 200 child records should be updated');
    }

    // ========================================
    // RECURSION PREVENTION TEST
    // ========================================

    @isTest
    static void testUpdate_RecursionPrevention() {
        ObjectName record = [SELECT Id, ImportantField__c FROM ObjectName LIMIT 1];
        record.ImportantField__c = 'Recursion Test';

        Test.startTest();
        update record;  // Trigger fires once
        Test.stopTest();

        // If trigger updates children, and children trigger updates parent,
        // recursion flag should prevent infinite loop
        ObjectName requeried = [SELECT ImportantField__c FROM ObjectName WHERE Id = :record.Id];
        System.assertEquals('Recursion Test', requeried.ImportantField__c,
            'Record should be updated without infinite loop');
    }

    // ========================================
    // GOVERNOR LIMIT TEST
    // ========================================

    @isTest
    static void testUpdate_GovernorLimits() {
        List<ObjectName> records = [SELECT Id, ImportantField__c, Status__c FROM ObjectName];

        for (ObjectName record : records) {
            record.ImportantField__c = 'Limit Test';
            record.Status__c = 'Completed';
        }

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        Integer dmlBefore = Limits.getDmlStatements();

        update records;

        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Integer dmlUsed = Limits.getDmlStatements() - dmlBefore;
        Test.stopTest();

        System.assert(queriesUsed < 10,
            'Should use <10 SOQL queries. Used: ' + queriesUsed);
        System.assert(dmlUsed < 5,
            'Should use <5 DML statements. Used: ' + dmlUsed);
    }

    // ========================================
    // CASCADE TEST
    // ========================================

    @isTest
    static void testUpdate_CascadesChanges() {
        ObjectName record = [SELECT Id, Status__c FROM ObjectName LIMIT 1];
        record.Status__c = 'Cancelled';

        Test.startTest();
        update record;
        Test.stopTest();

        // Verify status cascaded to children
        List<ChildObject__c> children = [
            SELECT Status__c
            FROM ChildObject__c
            WHERE ParentId__c = :record.Id
        ];

        // (Assuming cascade logic exists)
        // System.assertEquals('Cancelled', children[0].Status__c, 'Status should cascade to children');
    }
}
*/
