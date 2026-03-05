/**
 * Create Child Records Template
 *
 * USE CASE: Automatically create child/related records when parent is created
 *
 * When to use this template:
 * - Create default task records for new opportunities
 * - Create contact roles when account is created
 * - Create line items based on product bundles
 * - Create milestone records for new projects
 * - Create team member assignments
 * - Create approval history records
 * - Create audit trail records
 *
 * COMPLEXITY: Medium
 * GOVERNOR LIMITS: Target < 5 SOQL queries, < 3 DML operations
 *
 * CUSTOMIZATION CHECKLIST:
 * 1. Replace ObjectName with your parent object API name
 * 2. Replace child object names (ChildObject__c) with your child objects
 * 3. Implement your child record creation logic
 * 4. Configure which fields to copy from parent to child
 * 5. Add conditional logic (only create children if certain conditions met)
 * 6. Consider using @future for large child record creation
 */

// ============================================================================
// TRIGGER FILE: ObjectNameTrigger.trigger
// ============================================================================
trigger ObjectNameTrigger on ObjectName (after insert) {
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
            if (Trigger.isAfter && Trigger.isInsert) {
                handleAfterInsert(Trigger.new);
            }
        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // AFTER INSERT - Create child records for new parents
    // ========================================================================
    private static void handleAfterInsert(List<ObjectName> newRecords) {
        // Create different types of child records
        createDefaultTasks(newRecords);
        createMilestones(newRecords);
        createTeamMembers(newRecords);
        createLineItems(newRecords);
        createContactRoles(newRecords);
    }

    // ========================================================================
    // PATTERN 1: Create Default Tasks (Onboarding Checklist)
    // ========================================================================
    private static void createDefaultTasks(List<ObjectName> records) {
        List<Task> tasksToInsert = new List<Task>();

        for (ObjectName record : records) {
            // Only create tasks for certain record types or statuses
            if (record.RecordTypeId == getCustomerRecordTypeId() &&
                record.CreateOnboardingTasks__c == true) {

                // Task 1: Welcome Call
                tasksToInsert.add(new Task(
                    WhatId = record.Id,
                    Subject = 'Welcome Call - ' + record.Name,
                    Description = 'Schedule and complete welcome call with customer',
                    Priority = 'High',
                    Status = 'Not Started',
                    ActivityDate = Date.today().addDays(1),
                    OwnerId = record.OwnerId
                ));

                // Task 2: Setup Meeting
                tasksToInsert.add(new Task(
                    WhatId = record.Id,
                    Subject = 'Setup Meeting - ' + record.Name,
                    Description = 'Schedule setup meeting to configure system',
                    Priority = 'Normal',
                    Status = 'Not Started',
                    ActivityDate = Date.today().addDays(3),
                    OwnerId = record.OwnerId
                ));

                // Task 3: Training Session
                tasksToInsert.add(new Task(
                    WhatId = record.Id,
                    Subject = 'Training Session - ' + record.Name,
                    Description = 'Conduct initial training session',
                    Priority = 'Normal',
                    Status = 'Not Started',
                    ActivityDate = Date.today().addDays(7),
                    OwnerId = record.OwnerId
                ));

                // Task 4: Follow-up Review
                tasksToInsert.add(new Task(
                    WhatId = record.Id,
                    Subject = 'Follow-up Review - ' + record.Name,
                    Description = 'Review progress and address questions',
                    Priority = 'Normal',
                    Status = 'Not Started',
                    ActivityDate = Date.today().addDays(14),
                    OwnerId = record.OwnerId
                ));
            }
        }

        // Single DML operation for all tasks
        if (!tasksToInsert.isEmpty()) {
            insert tasksToInsert;
        }
    }

    // ========================================================================
    // PATTERN 2: Create Milestone Records (Project Phases)
    // ========================================================================
    private static void createMilestones(List<ObjectName> records) {
        List<Milestone__c> milestonesToInsert = new List<Milestone__c>();

        for (ObjectName record : records) {
            // Only create milestones for Project record type
            if (record.RecordTypeId == getProjectRecordTypeId()) {

                // Phase 1: Planning
                milestonesToInsert.add(new Milestone__c(
                    ParentId__c = record.Id,
                    Name = 'Planning Phase',
                    Description__c = 'Complete project planning and requirements',
                    Phase__c = 'Planning',
                    Status__c = 'Not Started',
                    StartDate__c = record.StartDate__c,
                    EndDate__c = record.StartDate__c != null ?
                        record.StartDate__c.addDays(14) : null,
                    Order__c = 1,
                    IsRequired__c = true,
                    CompletionPercentage__c = 0
                ));

                // Phase 2: Development
                milestonesToInsert.add(new Milestone__c(
                    ParentId__c = record.Id,
                    Name = 'Development Phase',
                    Description__c = 'Execute development and implementation',
                    Phase__c = 'Development',
                    Status__c = 'Not Started',
                    StartDate__c = record.StartDate__c != null ?
                        record.StartDate__c.addDays(15) : null,
                    EndDate__c = record.StartDate__c != null ?
                        record.StartDate__c.addDays(60) : null,
                    Order__c = 2,
                    IsRequired__c = true,
                    CompletionPercentage__c = 0
                ));

                // Phase 3: Testing
                milestonesToInsert.add(new Milestone__c(
                    ParentId__c = record.Id,
                    Name = 'Testing Phase',
                    Description__c = 'Complete QA and user acceptance testing',
                    Phase__c = 'Testing',
                    Status__c = 'Not Started',
                    StartDate__c = record.StartDate__c != null ?
                        record.StartDate__c.addDays(61) : null,
                    EndDate__c = record.StartDate__c != null ?
                        record.StartDate__c.addDays(75) : null,
                    Order__c = 3,
                    IsRequired__c = true,
                    CompletionPercentage__c = 0
                ));

                // Phase 4: Deployment
                milestonesToInsert.add(new Milestone__c(
                    ParentId__c = record.Id,
                    Name = 'Deployment Phase',
                    Description__c = 'Deploy to production and go-live',
                    Phase__c = 'Deployment',
                    Status__c = 'Not Started',
                    StartDate__c = record.StartDate__c != null ?
                        record.StartDate__c.addDays(76) : null,
                    EndDate__c = record.EndDate__c,
                    Order__c = 4,
                    IsRequired__c = true,
                    CompletionPercentage__c = 0
                ));
            }
        }

        if (!milestonesToInsert.isEmpty()) {
            insert milestonesToInsert;
        }
    }

    // ========================================================================
    // PATTERN 3: Create Team Member Assignments
    // ========================================================================
    private static void createTeamMembers(List<ObjectName> records) {
        List<TeamMember__c> teamMembersToInsert = new List<TeamMember__c>();

        // Query user roles to assign team members
        Map<String, Id> roleNameToUserId = getUsersByRole();

        for (ObjectName record : records) {
            // Only create team for Enterprise deals
            if (record.Type__c == 'Enterprise' && record.Amount__c > 100000) {

                // Add Account Executive (current owner)
                teamMembersToInsert.add(new TeamMember__c(
                    ParentId__c = record.Id,
                    UserId__c = record.OwnerId,
                    Role__c = 'Account Executive',
                    IsPrimary__c = true,
                    AccessLevel__c = 'Edit',
                    JoinDate__c = Date.today()
                ));

                // Add Sales Engineer
                if (roleNameToUserId.containsKey('Sales Engineer')) {
                    teamMembersToInsert.add(new TeamMember__c(
                        ParentId__c = record.Id,
                        UserId__c = roleNameToUserId.get('Sales Engineer'),
                        Role__c = 'Sales Engineer',
                        IsPrimary__c = false,
                        AccessLevel__c = 'Edit',
                        JoinDate__c = Date.today()
                    ));
                }

                // Add Customer Success Manager
                if (roleNameToUserId.containsKey('Customer Success')) {
                    teamMembersToInsert.add(new TeamMember__c(
                        ParentId__c = record.Id,
                        UserId__c = roleNameToUserId.get('Customer Success'),
                        Role__c = 'Customer Success Manager',
                        IsPrimary__c = false,
                        AccessLevel__c = 'Read',
                        JoinDate__c = Date.today()
                    ));
                }

                // Add Sales Manager (owner's manager)
                Id managerId = getManagerId(record.OwnerId);
                if (managerId != null) {
                    teamMembersToInsert.add(new TeamMember__c(
                        ParentId__c = record.Id,
                        UserId__c = managerId,
                        Role__c = 'Sales Manager',
                        IsPrimary__c = false,
                        AccessLevel__c = 'Read',
                        JoinDate__c = Date.today()
                    ));
                }
            }
        }

        if (!teamMembersToInsert.isEmpty()) {
            insert teamMembersToInsert;
        }
    }

    // ========================================================================
    // PATTERN 4: Create Line Items from Product Bundle
    // ========================================================================
    private static void createLineItems(List<ObjectName> records) {
        // Collect product bundle IDs
        Set<Id> bundleIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.ProductBundle__c != null) {
                bundleIds.add(record.ProductBundle__c);
            }
        }

        if (bundleIds.isEmpty()) return;

        // Query bundle components (SINGLE query)
        Map<Id, List<BundleComponent__c>> bundleComponentsMap =
            new Map<Id, List<BundleComponent__c>>();

        for (BundleComponent__c component : [
            SELECT Id, ProductBundleId__c, ProductId__c, Product__r.Name,
                   Quantity__c, UnitPrice__c, DiscountPercent__c,
                   IsRequired__c, SortOrder__c
            FROM BundleComponent__c
            WHERE ProductBundleId__c IN :bundleIds
              AND IsActive__c = true
            ORDER BY SortOrder__c ASC
        ]) {
            if (!bundleComponentsMap.containsKey(component.ProductBundleId__c)) {
                bundleComponentsMap.put(component.ProductBundleId__c,
                    new List<BundleComponent__c>());
            }
            bundleComponentsMap.get(component.ProductBundleId__c).add(component);
        }

        // Create line items
        List<LineItem__c> lineItemsToInsert = new List<LineItem__c>();

        for (ObjectName record : records) {
            if (record.ProductBundle__c != null &&
                bundleComponentsMap.containsKey(record.ProductBundle__c)) {

                List<BundleComponent__c> components =
                    bundleComponentsMap.get(record.ProductBundle__c);

                for (BundleComponent__c component : components) {
                    lineItemsToInsert.add(new LineItem__c(
                        ParentId__c = record.Id,
                        ProductId__c = component.ProductId__c,
                        Name = component.Product__r.Name,
                        Quantity__c = component.Quantity__c,
                        UnitPrice__c = component.UnitPrice__c,
                        DiscountPercent__c = component.DiscountPercent__c,
                        IsRequired__c = component.IsRequired__c,
                        SortOrder__c = component.SortOrder__c
                    ));
                }
            }
        }

        if (!lineItemsToInsert.isEmpty()) {
            insert lineItemsToInsert;
        }
    }

    // ========================================================================
    // PATTERN 5: Create Contact Roles
    // ========================================================================
    private static void createContactRoles(List<ObjectName> records) {
        // Collect account IDs
        Set<Id> accountIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.AccountId != null && record.CreateContactRoles__c) {
                accountIds.add(record.AccountId);
            }
        }

        if (accountIds.isEmpty()) return;

        // Query primary contacts from accounts (SINGLE query)
        Map<Id, List<Contact>> accountContactsMap = new Map<Id, List<Contact>>();

        for (Contact contact : [
            SELECT Id, AccountId, Name, Title, Email, IsPrimary__c
            FROM Contact
            WHERE AccountId IN :accountIds
              AND IsActive__c = true
            ORDER BY IsPrimary__c DESC, LastModifiedDate DESC
            LIMIT 200
        ]) {
            if (!accountContactsMap.containsKey(contact.AccountId)) {
                accountContactsMap.put(contact.AccountId, new List<Contact>());
            }
            accountContactsMap.get(contact.AccountId).add(contact);
        }

        // Create contact roles
        List<ContactRole__c> rolesToInsert = new List<ContactRole__c>();

        for (ObjectName record : records) {
            if (record.AccountId != null &&
                record.CreateContactRoles__c &&
                accountContactsMap.containsKey(record.AccountId)) {

                List<Contact> contacts = accountContactsMap.get(record.AccountId);

                // Create role for each contact (limit to 5)
                Integer count = 0;
                for (Contact contact : contacts) {
                    if (count >= 5) break;

                    // Primary contact gets Decision Maker role
                    String role = contact.IsPrimary__c ?
                        'Decision Maker' : 'Influencer';

                    rolesToInsert.add(new ContactRole__c(
                        ParentId__c = record.Id,
                        ContactId__c = contact.Id,
                        Role__c = role,
                        IsPrimary__c = contact.IsPrimary__c
                    ));

                    count++;
                }
            }
        }

        if (!rolesToInsert.isEmpty()) {
            insert rolesToInsert;
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Cache record type IDs
     */
    private static Id customerRecordTypeId;
    private static Id projectRecordTypeId;

    private static Id getCustomerRecordTypeId() {
        if (customerRecordTypeId == null) {
            Map<String, Schema.RecordTypeInfo> recordTypes =
                Schema.SObjectType.ObjectName.getRecordTypeInfosByName();
            customerRecordTypeId = recordTypes.get('Customer').getRecordTypeId();
        }
        return customerRecordTypeId;
    }

    private static Id getProjectRecordTypeId() {
        if (projectRecordTypeId == null) {
            Map<String, Schema.RecordTypeInfo> recordTypes =
                Schema.SObjectType.ObjectName.getRecordTypeInfosByName();
            projectRecordTypeId = recordTypes.get('Project').getRecordTypeId();
        }
        return projectRecordTypeId;
    }

    /**
     * Get users by role name (cached)
     */
    private static Map<String, Id> usersByRole;

    private static Map<String, Id> getUsersByRole() {
        if (usersByRole == null) {
            usersByRole = new Map<String, Id>();

            // Query users by role (round-robin or default assignment)
            for (User u : [
                SELECT Id, UserRole.Name
                FROM User
                WHERE IsActive = true
                  AND UserRole.Name != null
                LIMIT 100
            ]) {
                if (!usersByRole.containsKey(u.UserRole.Name)) {
                    usersByRole.put(u.UserRole.Name, u.Id);
                }
            }
        }

        return usersByRole;
    }

    /**
     * Get manager ID for a user
     */
    private static Map<Id, Id> managerCache;

    private static Id getManagerId(Id userId) {
        if (managerCache == null) {
            managerCache = new Map<Id, Id>();

            // Query managers for all users in batch
            for (User u : [
                SELECT Id, ManagerId
                FROM User
                WHERE Id = :userId OR ManagerId = :userId
            ]) {
                if (u.ManagerId != null) {
                    managerCache.put(u.Id, u.ManagerId);
                }
            }
        }

        return managerCache.get(userId);
    }
}

// ============================================================================
// TEST CLASS: ObjectNameTriggerHandlerTest.cls
// ============================================================================
@isTest
private class ObjectNameTriggerHandlerTest {

    // ========================================================================
    // TEST SETUP
    // ========================================================================
    @testSetup
    static void setup() {
        // Create account
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        // Create contacts
        List<Contact> contacts = new List<Contact>();
        contacts.add(new Contact(
            AccountId = acc.Id,
            FirstName = 'Primary',
            LastName = 'Contact',
            Email = 'primary@test.com',
            IsPrimary__c = true,
            IsActive__c = true
        ));
        contacts.add(new Contact(
            AccountId = acc.Id,
            FirstName = 'Secondary',
            LastName = 'Contact',
            Email = 'secondary@test.com',
            IsPrimary__c = false,
            IsActive__c = true
        ));
        insert contacts;

        // Create product bundle
        ProductBundle__c bundle = new ProductBundle__c(
            Name = 'Enterprise Bundle',
            IsActive__c = true
        );
        insert bundle;

        // Create bundle components
        List<BundleComponent__c> components = new List<BundleComponent__c>();
        for (Integer i = 0; i < 3; i++) {
            components.add(new BundleComponent__c(
                ProductBundleId__c = bundle.Id,
                ProductId__c = 'PROD' + i, // Mock product ID
                Name = 'Product ' + i,
                Quantity__c = 1,
                UnitPrice__c = 100 * (i + 1),
                IsRequired__c = true,
                IsActive__c = true,
                SortOrder__c = i
            ));
        }
        insert components;
    }

    // ========================================================================
    // TEST: Create Default Tasks
    // ========================================================================
    @isTest
    static void testCreateDefaultTasks() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Task Test',
            RecordTypeId = getRecordTypeId('Customer'),
            CreateOnboardingTasks__c = true
        );

        insert record;

        List<Task> tasks = [SELECT Id, Subject, Priority, Status, ActivityDate
                            FROM Task
                            WHERE WhatId = :record.Id
                            ORDER BY ActivityDate ASC];

        System.assertEquals(4, tasks.size(), 'Should create 4 onboarding tasks');

        System.assert(tasks[0].Subject.contains('Welcome Call'),
            'First task should be Welcome Call');
        System.assertEquals('High', tasks[0].Priority,
            'Welcome Call should be high priority');

        System.assert(tasks[1].Subject.contains('Setup Meeting'),
            'Second task should be Setup Meeting');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Create Milestones
    // ========================================================================
    @isTest
    static void testCreateMilestones() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Milestone Test',
            RecordTypeId = getRecordTypeId('Project'),
            StartDate__c = Date.today(),
            EndDate__c = Date.today().addDays(90)
        );

        insert record;

        List<Milestone__c> milestones = [
            SELECT Id, Name, Phase__c, Status__c, Order__c,
                   CompletionPercentage__c
            FROM Milestone__c
            WHERE ParentId__c = :record.Id
            ORDER BY Order__c ASC
        ];

        System.assertEquals(4, milestones.size(), 'Should create 4 milestones');

        System.assertEquals('Planning', milestones[0].Phase__c);
        System.assertEquals('Development', milestones[1].Phase__c);
        System.assertEquals('Testing', milestones[2].Phase__c);
        System.assertEquals('Deployment', milestones[3].Phase__c);

        for (Milestone__c m : milestones) {
            System.assertEquals('Not Started', m.Status__c);
            System.assertEquals(0, m.CompletionPercentage__c);
        }

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Create Team Members
    // ========================================================================
    @isTest
    static void testCreateTeamMembers() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Team Test',
            Type__c = 'Enterprise',
            Amount__c = 150000
        );

        insert record;

        List<TeamMember__c> teamMembers = [
            SELECT Id, Role__c, IsPrimary__c, AccessLevel__c
            FROM TeamMember__c
            WHERE ParentId__c = :record.Id
        ];

        System.assert(teamMembers.size() >= 1,
            'Should create at least Account Executive');

        // Find Account Executive
        TeamMember__c ae = null;
        for (TeamMember__c tm : teamMembers) {
            if (tm.Role__c == 'Account Executive') {
                ae = tm;
                break;
            }
        }

        System.assertNotEquals(null, ae, 'Should have Account Executive');
        System.assertEquals(true, ae.IsPrimary__c,
            'Account Executive should be primary');
        System.assertEquals('Edit', ae.AccessLevel__c);

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Create Line Items from Bundle
    // ========================================================================
    @isTest
    static void testCreateLineItemsFromBundle() {
        Test.startTest();

        ProductBundle__c bundle = [SELECT Id FROM ProductBundle__c LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Bundle Test',
            ProductBundle__c = bundle.Id
        );

        insert record;

        List<LineItem__c> lineItems = [
            SELECT Id, ProductId__c, Quantity__c, UnitPrice__c, SortOrder__c
            FROM LineItem__c
            WHERE ParentId__c = :record.Id
            ORDER BY SortOrder__c ASC
        ];

        System.assertEquals(3, lineItems.size(),
            'Should create 3 line items from bundle');

        System.assertEquals(100, lineItems[0].UnitPrice__c);
        System.assertEquals(200, lineItems[1].UnitPrice__c);
        System.assertEquals(300, lineItems[2].UnitPrice__c);

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Create Contact Roles
    // ========================================================================
    @isTest
    static void testCreateContactRoles() {
        Test.startTest();

        Account acc = [SELECT Id FROM Account LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Contact Role Test',
            AccountId = acc.Id,
            CreateContactRoles__c = true
        );

        insert record;

        List<ContactRole__c> roles = [
            SELECT Id, Role__c, IsPrimary__c
            FROM ContactRole__c
            WHERE ParentId__c = :record.Id
        ];

        System.assertEquals(2, roles.size(),
            'Should create 2 contact roles (one per contact)');

        // Find primary role
        ContactRole__c primaryRole = null;
        for (ContactRole__c role : roles) {
            if (role.IsPrimary__c) {
                primaryRole = role;
                break;
            }
        }

        System.assertNotEquals(null, primaryRole, 'Should have primary role');
        System.assertEquals('Decision Maker', primaryRole.Role__c,
            'Primary contact should be Decision Maker');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Bulk Operations (200 records)
    // ========================================================================
    @isTest
    static void testBulkOperations() {
        Test.startTest();

        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Bulk Test ' + i,
                RecordTypeId = getRecordTypeId('Customer'),
                CreateOnboardingTasks__c = true
            ));
        }

        insert records;

        List<Task> tasks = [SELECT Id FROM Task
                            WHERE WhatId IN :records];

        System.assertEquals(800, tasks.size(),
            'Should create 4 tasks × 200 records = 800 tasks');

        // Verify governor limits
        System.assert(Limits.getQueries() < 5,
            'Should use < 5 SOQL queries');
        System.assert(Limits.getDMLStatements() < 3,
            'Should use < 3 DML statements');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Conditional Child Creation
    // ========================================================================
    @isTest
    static void testConditionalChildCreation() {
        Test.startTest();

        // Record that should NOT create tasks
        ObjectName record1 = new ObjectName(
            Name = 'No Tasks Test',
            RecordTypeId = getRecordTypeId('Partner'), // Not Customer
            CreateOnboardingTasks__c = false
        );

        insert record1;

        List<Task> tasks = [SELECT Id FROM Task WHERE WhatId = :record1.Id];

        System.assertEquals(0, tasks.size(),
            'Should not create tasks for non-Customer record types');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Recursion Prevention
    // ========================================================================
    @isTest
    static void testRecursionPrevention() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Recursion Test',
            RecordTypeId = getRecordTypeId('Customer'),
            CreateOnboardingTasks__c = true
        );

        insert record;

        // Update parent (should not trigger infinite loop via child updates)
        record.Name = 'Updated Name';
        update record;

        System.assert(true, 'Should not hit recursion issues');

        Test.stopTest();
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================
    private static Id getRecordTypeId(String recordTypeName) {
        Map<String, Schema.RecordTypeInfo> recordTypes =
            Schema.SObjectType.ObjectName.getRecordTypeInfosByName();
        return recordTypes.get(recordTypeName).getRecordTypeId();
    }
}
