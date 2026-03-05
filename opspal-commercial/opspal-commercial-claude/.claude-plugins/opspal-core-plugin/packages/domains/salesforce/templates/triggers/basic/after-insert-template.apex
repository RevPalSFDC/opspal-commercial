/**
 * @description Minimal after insert trigger with handler pattern
 * @usage Create related records, send notifications
 * @complexity Simple
 * @bestPractices Handler pattern, recursion prevention, bulkification
 *
 * USE CASE EXAMPLES:
 * - Create related child records (e.g., default Contacts for new Account)
 * - Send email notifications
 * - Create tasks/events for follow-up
 * - Update parent record counters
 * - Publish platform events
 * - Create sharing rules programmatically
 *
 * WHY AFTER INSERT:
 * - Record now has an ID (can create related records)
 * - Trigger.new is READ-ONLY (cannot modify directly)
 * - Use for DML operations on OTHER objects
 * - Runs after record is committed to database
 * - Ideal for creating related records and notifications
 *
 * KEY PATTERN: Trigger.new is READ-ONLY
 * - Cannot modify Trigger.new records directly
 * - If need to update same record, use after update trigger
 * - Or query and update in separate DML operation (avoid if possible)
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your object (e.g., Account, Opportunity)
 * [ ] Update handler class name (ObjectNameTriggerHandler)
 * [ ] Implement related record creation logic
 * [ ] Add test class with 200 record bulk test
 * [ ] Deploy to sandbox and test before production
 */

trigger ObjectNameTrigger on ObjectName (after insert) {
    ObjectNameTriggerHandler.handleAfterInsert(Trigger.new);
}

/**
 * HANDLER CLASS TEMPLATE
 *
 * IMPLEMENTATION NOTES:
 * - Keep trigger minimal (just routing logic)
 * - Put ALL business logic in handler class
 * - Implement recursion prevention
 * - Trigger.new is READ-ONLY (cannot modify)
 * - Query outside loops, use Map for lookups
 * - Collect records for DML, perform single operation
 */
/*
public class ObjectNameTriggerHandler {

    // ========================================
    // RECURSION PREVENTION
    // ========================================
    private static Boolean isExecuting = false;

    // ========================================
    // MAIN HANDLER
    // ========================================
    public static void handleAfterInsert(List<ObjectName> newRecords) {
        if (isExecuting) return;
        isExecuting = true;

        // Call helper methods in logical order
        createDefaultChildRecords(newRecords);     // 1. Create related records
        updateParentCounters(newRecords);          // 2. Update parent statistics
        sendNotifications(newRecords);             // 3. Send emails/alerts
        createFollowUpTasks(newRecords);           // 4. Create tasks

        isExecuting = false;
    }

    // ========================================
    // CREATE RELATED RECORDS
    // ========================================

    private static void createDefaultChildRecords(List<ObjectName> records) {
        List<ChildObject__c> childrenToInsert = new List<ChildObject__c>();

        for (ObjectName record : records) {
            // Only create children if condition met
            if (record.CreateChildren__c) {
                // Create default child record
                childrenToInsert.add(new ChildObject__c(
                    ParentId__c = record.Id,
                    Name = 'Default ' + record.Name,
                    Status__c = 'New',
                    Type__c = 'Standard'
                ));
            }
        }

        // Single DML operation for all children
        if (!childrenToInsert.isEmpty()) {
            insert childrenToInsert;
        }
    }

    // ========================================
    // UPDATE PARENT RECORDS
    // ========================================

    private static void updateParentCounters(List<ObjectName> records) {
        // Collect parent IDs
        Set<Id> parentIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.ParentId__c != null) {
                parentIds.add(record.ParentId__c);
            }
        }

        if (parentIds.isEmpty()) return;

        // Query parent records with counts
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id,
                   (SELECT Id FROM ChildObjects__r)
            FROM ParentObject__c
            WHERE Id IN :parentIds
        ]);

        // Update parent counters
        List<ParentObject__c> parentsToUpdate = new List<ParentObject__c>();
        for (ParentObject__c parent : parentMap.values()) {
            parent.ChildCount__c = parent.ChildObjects__r.size();
            parentsToUpdate.add(parent);
        }

        // Single DML operation for all parents
        if (!parentsToUpdate.isEmpty()) {
            update parentsToUpdate;
        }
    }

    // ========================================
    // NOTIFICATION METHODS
    // ========================================

    private static void sendNotifications(List<ObjectName> records) {
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (ObjectName record : records) {
            // Only send notification if criteria met
            if (record.SendNotification__c && record.ContactEmail__c != null) {
                Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
                email.setToAddresses(new List<String>{record.ContactEmail__c});
                email.setSubject('New Record Created: ' + record.Name);
                email.setPlainTextBody(
                    'A new record has been created:\n\n' +
                    'Name: ' + record.Name + '\n' +
                    'Status: ' + record.Status__c + '\n' +
                    'Created By: ' + UserInfo.getName() + '\n' +
                    'Created Date: ' + System.now().format()
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
    // CREATE TASKS
    // ========================================

    private static void createFollowUpTasks(List<ObjectName> records) {
        List<Task> tasksToInsert = new List<Task>();

        for (ObjectName record : records) {
            // Only create task if high priority
            if (record.Priority__c == 'High') {
                Task t = new Task(
                    WhatId = record.Id,
                    Subject = 'Follow up on ' + record.Name,
                    Priority = 'High',
                    Status = 'Not Started',
                    ActivityDate = Date.today().addDays(1),
                    OwnerId = record.OwnerId,
                    Description = 'High priority record created. Please follow up within 24 hours.'
                );
                tasksToInsert.add(t);
            }
        }

        // Single DML operation for all tasks
        if (!tasksToInsert.isEmpty()) {
            insert tasksToInsert;
        }
    }
}
*/

/**
 * REAL-WORLD EXAMPLE: Account After Insert
 *
 * Scenario: Create default Contact, update Territory counters, send notification, create task
 */
/*
trigger AccountTrigger on Account (after insert) {
    AccountTriggerHandler.handleAfterInsert(Trigger.new);
}

public class AccountTriggerHandler {

    private static Boolean isExecuting = false;

    public static void handleAfterInsert(List<Account> newAccounts) {
        if (isExecuting) return;
        isExecuting = true;

        // Create default contacts
        createDefaultContacts(newAccounts);

        // Update territory statistics
        updateTerritoryCounters(newAccounts);

        // Send notifications
        sendNewAccountNotifications(newAccounts);

        // Create follow-up tasks
        createAccountTasks(newAccounts);

        isExecuting = false;
    }

    private static void createDefaultContacts(List<Account> accounts) {
        List<Contact> contactsToInsert = new List<Contact>();

        for (Account acc : accounts) {
            // Create primary contact if flag set
            if (acc.CreatePrimaryContact__c) {
                Contact con = new Contact(
                    AccountId = acc.Id,
                    LastName = acc.Name + ' - Primary',
                    Title = 'Primary Contact',
                    Email = acc.Website != null ? 'contact@' + acc.Website : null,
                    Phone = acc.Phone,
                    IsPrimary__c = true
                );
                contactsToInsert.add(con);
            }
        }

        if (!contactsToInsert.isEmpty()) {
            insert contactsToInsert;
        }
    }

    private static void updateTerritoryCounters(List<Account> accounts) {
        // Collect territory IDs
        Set<Id> territoryIds = new Set<Id>();
        for (Account acc : accounts) {
            if (acc.TerritoryId__c != null) {
                territoryIds.add(acc.TerritoryId__c);
            }
        }

        if (territoryIds.isEmpty()) return;

        // Query territories with account counts
        Map<Id, Territory__c> territoryMap = new Map<Id, Territory__c>([
            SELECT Id,
                   (SELECT Id FROM Accounts__r)
            FROM Territory__c
            WHERE Id IN :territoryIds
        ]);

        // Update counters
        List<Territory__c> territoriesToUpdate = new List<Territory__c>();
        for (Territory__c territory : territoryMap.values()) {
            territory.AccountCount__c = territory.Accounts__r.size();
            territoriesToUpdate.add(territory);
        }

        if (!territoriesToUpdate.isEmpty()) {
            update territoriesToUpdate;
        }
    }

    private static void sendNewAccountNotifications(List<Account> accounts) {
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (Account acc : accounts) {
            // Send notification for Enterprise accounts
            if (acc.Type == 'Customer - Enterprise' && acc.AnnualRevenue >= 1000000) {
                Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
                email.setToAddresses(new List<String>{'sales-leadership@company.com'});
                email.setSubject('New Enterprise Account: ' + acc.Name);
                email.setPlainTextBody(
                    'A new Enterprise account has been created:\n\n' +
                    'Account Name: ' + acc.Name + '\n' +
                    'Annual Revenue: $' + String.valueOf(acc.AnnualRevenue) + '\n' +
                    'Industry: ' + acc.Industry + '\n' +
                    'Owner: ' + acc.Owner.Name + '\n' +
                    '\nPlease review and assign to appropriate team.'
                );
                emails.add(email);
            }
        }

        if (!emails.isEmpty()) {
            Messaging.sendEmail(emails);
        }
    }

    private static void createAccountTasks(List<Account> accounts) {
        List<Task> tasksToInsert = new List<Task>();

        for (Account acc : accounts) {
            // Create task for hot accounts
            if (acc.Rating == 'Hot') {
                Task t = new Task(
                    WhatId = acc.Id,
                    Subject = 'Initial outreach for ' + acc.Name,
                    Priority = 'High',
                    Status = 'Not Started',
                    ActivityDate = Date.today().addDays(1),
                    OwnerId = acc.OwnerId,
                    Description = 'Hot account created. Reach out within 24 hours for initial meeting.'
                );
                tasksToInsert.add(t);
            }

            // Create task for accounts without phone
            if (acc.Phone == null) {
                Task t = new Task(
                    WhatId = acc.Id,
                    Subject = 'Obtain phone number for ' + acc.Name,
                    Priority = 'Normal',
                    Status = 'Not Started',
                    ActivityDate = Date.today().addDays(7),
                    OwnerId = acc.OwnerId,
                    Description = 'Account created without phone number. Please obtain contact information.'
                );
                tasksToInsert.add(t);
            }
        }

        if (!tasksToInsert.isEmpty()) {
            insert tasksToInsert;
        }
    }
}
*/

/**
 * ADVANCED PATTERN: Platform Event Publishing
 *
 * Use after insert to publish platform events for event-driven architecture
 */
/*
public static void publishEvents(List<ObjectName> records) {
    List<Record_Created__e> events = new List<Record_Created__e>();

    for (ObjectName record : records) {
        // Publish event for external systems
        Record_Created__e event = new Record_Created__e(
            RecordId__c = record.Id,
            RecordName__c = record.Name,
            RecordType__c = 'ObjectName',
            Priority__c = record.Priority__c,
            CreatedBy__c = UserInfo.getUserId()
        );
        events.add(event);
    }

    if (!events.isEmpty()) {
        EventBus.publish(events);
    }
}
*/

/**
 * ADVANCED PATTERN: Programmatic Sharing
 *
 * Use after insert to create sharing rules
 */
/*
public static void createSharing(List<ObjectName> records) {
    List<ObjectName__Share> sharesToInsert = new List<ObjectName__Share>();

    for (ObjectName record : records) {
        // Share with manager
        if (record.ManagerId__c != null) {
            ObjectName__Share share = new ObjectName__Share(
                ParentId = record.Id,
                UserOrGroupId = record.ManagerId__c,
                AccessLevel = 'Edit',
                RowCause = Schema.ObjectName__Share.RowCause.Manager__c
            );
            sharesToInsert.add(share);
        }

        // Share with team
        if (record.TeamId__c != null) {
            ObjectName__Share share = new ObjectName__Share(
                ParentId = record.Id,
                UserOrGroupId = record.TeamId__c,
                AccessLevel = 'Read',
                RowCause = Schema.ObjectName__Share.RowCause.Team__c
            );
            sharesToInsert.add(share);
        }
    }

    if (!sharesToInsert.isEmpty()) {
        insert sharesToInsert;
    }
}
*/

/**
 * TEST CLASS TEMPLATE
 *
 * TESTING CHECKLIST:
 * [ ] Test child record creation
 * [ ] Test parent counter update
 * [ ] Test notification sending
 * [ ] Test task creation
 * [ ] Test bulk (200 records) - MANDATORY
 * [ ] Test recursion prevention
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
    }

    // ========================================
    // CHILD RECORD CREATION TEST
    // ========================================

    @isTest
    static void testInsert_CreatesChildRecords() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ParentId__c = parent.Id,
            CreateChildren__c = true
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        // Verify child was created
        List<ChildObject__c> children = [
            SELECT Id, Name
            FROM ChildObject__c
            WHERE ParentId__c = :record.Id
        ];

        System.assertEquals(1, children.size(), 'Should create one child record');
        System.assertEquals('Default Test Record', children[0].Name, 'Child name should be default');
    }

    // ========================================
    // PARENT COUNTER UPDATE TEST
    // ========================================

    @isTest
    static void testInsert_UpdatesParentCounter() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ParentId__c = parent.Id
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        // Verify parent counter updated
        ParentObject__c updated = [
            SELECT ChildCount__c
            FROM ParentObject__c
            WHERE Id = :parent.Id
        ];

        System.assertEquals(1, updated.ChildCount__c, 'Parent counter should be updated');
    }

    // ========================================
    // NOTIFICATION TEST
    // ========================================

    @isTest
    static void testInsert_SendsNotification() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            SendNotification__c = true,
            ContactEmail__c = 'test@example.com'
        );

        Test.startTest();
        Integer emailsBefore = Limits.getEmailInvocations();
        insert record;
        Integer emailsUsed = Limits.getEmailInvocations() - emailsBefore;
        Test.stopTest();

        System.assert(emailsUsed > 0, 'Should send email notification');
    }

    // ========================================
    // TASK CREATION TEST
    // ========================================

    @isTest
    static void testInsert_CreatesTask() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Priority__c = 'High'
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        // Verify task was created
        List<Task> tasks = [
            SELECT Id, Subject, Priority, WhatId
            FROM Task
            WHERE WhatId = :record.Id
        ];

        System.assertEquals(1, tasks.size(), 'Should create one task');
        System.assertEquals('High', tasks[0].Priority, 'Task priority should match record');
    }

    // ========================================
    // BULK INSERT TEST (MANDATORY)
    // ========================================

    @isTest
    static void testInsert_BulkRecords() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                ParentId__c = parent.Id,
                CreateChildren__c = true
            ));
        }

        Test.startTest();
        insert records;
        Test.stopTest();

        // Verify all child records created
        List<ChildObject__c> children = [
            SELECT Id
            FROM ChildObject__c
            WHERE ParentId__c IN :records
        ];

        System.assertEquals(200, children.size(), 'Should create 200 child records');
    }

    // ========================================
    // CONDITIONAL LOGIC TEST
    // ========================================

    @isTest
    static void testInsert_NoChildrenWhenFlagFalse() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ParentId__c = parent.Id,
            CreateChildren__c = false  // Flag is false
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        // Verify NO child was created
        List<ChildObject__c> children = [
            SELECT Id
            FROM ChildObject__c
            WHERE ParentId__c = :record.Id
        ];

        System.assertEquals(0, children.size(), 'Should not create child when flag is false');
    }

    // ========================================
    // GOVERNOR LIMIT TEST
    // ========================================

    @isTest
    static void testInsert_GovernorLimits() {
        List<ParentObject__c> parents = [SELECT Id FROM ParentObject__c];

        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                ParentId__c = parents[Math.mod(i, parents.size())].Id,
                CreateChildren__c = true,
                Priority__c = 'High'  // Creates tasks
            ));
        }

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        Integer dmlBefore = Limits.getDmlStatements();

        insert records;

        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Integer dmlUsed = Limits.getDmlStatements() - dmlBefore;
        Test.stopTest();

        System.assert(queriesUsed < 10,
            'Should use <10 SOQL queries. Used: ' + queriesUsed);
        System.assert(dmlUsed < 5,
            'Should use <5 DML statements. Used: ' + dmlUsed);
    }

    // ========================================
    // MULTIPLE OPERATIONS TEST
    // ========================================

    @isTest
    static void testInsert_MultipleOperations() {
        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ParentId__c = parent.Id,
            CreateChildren__c = true,
            Priority__c = 'High',
            SendNotification__c = true,
            ContactEmail__c = 'test@example.com'
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        // Verify all operations executed
        List<ChildObject__c> children = [SELECT Id FROM ChildObject__c WHERE ParentId__c = :record.Id];
        List<Task> tasks = [SELECT Id FROM Task WHERE WhatId = :record.Id];
        ParentObject__c updated = [SELECT ChildCount__c FROM ParentObject__c WHERE Id = :parent.Id];

        System.assertEquals(1, children.size(), 'Should create child record');
        System.assertEquals(1, tasks.size(), 'Should create task');
        System.assertEquals(1, updated.ChildCount__c, 'Should update parent counter');
    }
}
*/
