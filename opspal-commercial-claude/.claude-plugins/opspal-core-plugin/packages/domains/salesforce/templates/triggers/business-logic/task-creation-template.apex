/**
 * TASK CREATION TRIGGER TEMPLATE
 *
 * Purpose: Automatically create tasks and follow-up activities based on record changes
 * Use Case: Create tasks when:
 *   - New record created → Create onboarding/setup tasks
 *   - Status changes → Create next-step tasks
 *   - Opportunity closed → Create follow-up tasks
 *   - Case escalated → Create urgent response task
 *   - Contract expires soon → Create renewal task
 *   - Milestone reached → Create celebration/review task
 *
 * Pattern: Event-driven task generation with templates and smart assignment
 *
 * Task Types:
 *   - Onboarding tasks (record creation)
 *   - Follow-up tasks (post-close, post-meeting)
 *   - Reminder tasks (due dates, renewals)
 *   - Approval tasks (pending approvals)
 *   - Escalation tasks (urgent issues)
 *   - Recurring tasks (regular check-ins)
 *
 * Business Benefits:
 *   - Ensures consistent follow-through
 *   - Reduces manual task creation effort
 *   - Improves process compliance
 *   - Standardizes workflows
 *   - Increases accountability
 *
 * Considerations:
 *   - Task assignment logic (owner, queue, manager)
 *   - Due date calculations (business days, SLAs)
 *   - Task dependencies and sequencing
 *   - Bulk operations (avoid governor limits)
 *   - Task templates and standardization
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your actual object API name
 * [ ] Configure task templates
 * [ ] Set up task assignment rules
 * [ ] Define due date calculations
 * [ ] Configure task priorities
 * [ ] Set up reminder notifications
 * [ ] Test task creation scenarios
 * [ ] Implement task completion tracking
 */

// ============================================================================
// TRIGGER FILE
// ============================================================================
trigger ObjectNameTaskCreationTrigger on ObjectName (after insert, after update) {
    ObjectNameTaskCreationHandler.handleTrigger();
}

// ============================================================================
// HANDLER CLASS
// ============================================================================
public class ObjectNameTaskCreationHandler {

    // Recursion prevention
    private static Boolean isExecuting = false;

    public static void handleTrigger() {
        // Prevent recursion
        if (isExecuting) {
            return;
        }

        try {
            isExecuting = true;

            if (Trigger.isAfter) {
                if (Trigger.isInsert) {
                    createInsertTasks(Trigger.new);
                } else if (Trigger.isUpdate) {
                    createUpdateTasks(Trigger.new, Trigger.oldMap);
                }
            }

        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // TASK TEMPLATES
    // ========================================================================

    // Onboarding task templates (for new records)
    private static final List<TaskTemplate> ONBOARDING_TASKS = new List<TaskTemplate>{
        new TaskTemplate(
            'Welcome Call',
            'Schedule and complete welcome call with customer',
            'High',
            1, // Due in 1 day
            'Call'
        ),
        new TaskTemplate(
            'Setup Account',
            'Complete account setup and configuration',
            'High',
            2,
            'Other'
        ),
        new TaskTemplate(
            'Training Session',
            'Schedule product training session',
            'Normal',
            5,
            'Meeting'
        ),
        new TaskTemplate(
            'First Check-in',
            'Follow up on initial experience',
            'Normal',
            7,
            'Call'
        )
    };

    // Follow-up task templates (for closed/completed records)
    private static final List<TaskTemplate> FOLLOWUP_TASKS = new List<TaskTemplate>{
        new TaskTemplate(
            'Request Feedback',
            'Ask for feedback on experience',
            'Normal',
            3,
            'Email'
        ),
        new TaskTemplate(
            'Check Satisfaction',
            'Verify customer satisfaction',
            'Normal',
            7,
            'Call'
        ),
        new TaskTemplate(
            'Upsell Opportunity',
            'Identify upsell/cross-sell opportunities',
            'Normal',
            14,
            'Other'
        )
    };

    // Escalation task template (urgent)
    private static final TaskTemplate ESCALATION_TASK = new TaskTemplate(
        'URGENT: Escalation Response',
        'Respond to escalated issue immediately',
        'High',
        0, // Due today
        'Call'
    );

    // ========================================================================
    // INSERT TASK CREATION
    // ========================================================================

    /**
     * Create tasks when records are created
     */
    public static void createInsertTasks(List<ObjectName> newRecords) {
        List<Task> tasksToInsert = new List<Task>();

        for (ObjectName record : newRecords) {
            // Skip if task creation disabled
            if (record.DisableTaskCreation__c == true) {
                continue;
            }

            // Create onboarding tasks
            if (shouldCreateOnboardingTasks(record)) {
                tasksToInsert.addAll(createTasksFromTemplates(
                    ONBOARDING_TASKS,
                    record.Id,
                    record.OwnerId
                ));
            }

            // Create custom tasks based on record type
            if (record.RecordTypeId != null) {
                tasksToInsert.addAll(createRecordTypeTasks(record));
            }

            // Create reminder task for due date
            if (record.DueDate__c != null) {
                tasksToInsert.add(createReminderTask(record));
            }
        }

        // Insert all tasks (single DML)
        if (!tasksToInsert.isEmpty()) {
            insert tasksToInsert;
        }
    }

    // ========================================================================
    // UPDATE TASK CREATION
    // ========================================================================

    /**
     * Create tasks when records are updated
     */
    public static void createUpdateTasks(List<ObjectName> newRecords,
                                         Map<Id, ObjectName> oldMap) {
        List<Task> tasksToInsert = new List<Task>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Skip if task creation disabled
            if (newRecord.DisableTaskCreation__c == true) {
                continue;
            }

            // Status change tasks
            if (newRecord.Status__c != oldRecord.Status__c) {
                tasksToInsert.addAll(createStatusChangeTasks(newRecord, oldRecord));
            }

            // Escalation tasks
            if (newRecord.IsEscalated__c == true &&
                oldRecord.IsEscalated__c != true) {
                tasksToInsert.add(createEscalationTask(newRecord));
            }

            // Owner change tasks
            if (newRecord.OwnerId != oldRecord.OwnerId) {
                tasksToInsert.add(createHandoffTask(newRecord, oldRecord));
            }

            // Amount change tasks (high-value changes)
            if (newRecord.Amount__c != oldRecord.Amount__c &&
                newRecord.Amount__c > 100000) {
                tasksToInsert.add(createExecutiveReviewTask(newRecord));
            }

            // Renewal tasks (approaching expiration)
            if (isRenewalNeeded(newRecord, oldRecord)) {
                tasksToInsert.addAll(createRenewalTasks(newRecord));
            }

            // Approval required tasks
            if (newRecord.RequiresApproval__c == true &&
                oldRecord.RequiresApproval__c != true) {
                tasksToInsert.add(createApprovalTask(newRecord));
            }
        }

        // Insert all tasks (single DML)
        if (!tasksToInsert.isEmpty()) {
            insert tasksToInsert;
        }
    }

    // ========================================================================
    // TASK CREATION METHODS
    // ========================================================================

    /**
     * Create tasks from templates
     */
    private static List<Task> createTasksFromTemplates(List<TaskTemplate> templates,
                                                       Id whatId,
                                                       Id ownerId) {
        List<Task> tasks = new List<Task>();

        for (TaskTemplate template : templates) {
            Task task = new Task();
            task.WhatId = whatId;
            task.OwnerId = ownerId;
            task.Subject = template.subject;
            task.Description = template.description;
            task.Priority = template.priority;
            task.Status = 'Not Started';
            task.ActivityDate = Date.today().addDays(template.daysUntilDue);
            task.TaskSubtype = template.taskType;
            task.IsAutoCreated__c = true;
            task.CreatedByAutomation__c = true;

            tasks.add(task);
        }

        return tasks;
    }

    /**
     * Create tasks based on record type
     */
    private static List<Task> createRecordTypeTasks(ObjectName record) {
        List<Task> tasks = new List<Task>();

        String recordTypeName = getRecordTypeName(record.RecordTypeId);

        // Customer record type tasks
        if (recordTypeName == 'Customer') {
            tasks.add(new Task(
                WhatId = record.Id,
                OwnerId = record.OwnerId,
                Subject = 'Send Welcome Package',
                Priority = 'High',
                Status = 'Not Started',
                ActivityDate = Date.today().addDays(1)
            ));

            tasks.add(new Task(
                WhatId = record.Id,
                OwnerId = record.OwnerId,
                Subject = 'Schedule Kickoff Meeting',
                Priority = 'High',
                Status = 'Not Started',
                ActivityDate = Date.today().addDays(2)
            ));
        }

        // Partner record type tasks
        if (recordTypeName == 'Partner') {
            tasks.add(new Task(
                WhatId = record.Id,
                OwnerId = record.OwnerId,
                Subject = 'Send Partner Agreement',
                Priority = 'High',
                Status = 'Not Started',
                ActivityDate = Date.today().addDays(1)
            ));
        }

        return tasks;
    }

    /**
     * Create reminder task for due date
     */
    private static Task createReminderTask(ObjectName record) {
        // Create reminder 3 days before due date
        Date reminderDate = record.DueDate__c.addDays(-3);

        Task task = new Task();
        task.WhatId = record.Id;
        task.OwnerId = record.OwnerId;
        task.Subject = 'Reminder: ' + record.Name + ' Due Soon';
        task.Description = 'This record is due on ' + record.DueDate__c.format();
        task.Priority = 'Normal';
        task.Status = 'Not Started';
        task.ActivityDate = reminderDate > Date.today() ?
            reminderDate : Date.today();
        task.IsReminderSet = true;
        task.ReminderDateTime = DateTime.newInstance(
            reminderDate,
            Time.newInstance(9, 0, 0, 0) // 9 AM reminder
        );

        return task;
    }

    /**
     * Create status change tasks
     */
    private static List<Task> createStatusChangeTasks(ObjectName newRecord,
                                                      ObjectName oldRecord) {
        List<Task> tasks = new List<Task>();

        // Closed Won - create follow-up tasks
        if (newRecord.Status__c == 'Closed Won') {
            tasks.addAll(createTasksFromTemplates(
                FOLLOWUP_TASKS,
                newRecord.Id,
                newRecord.OwnerId
            ));

            // Create contract generation task
            tasks.add(new Task(
                WhatId = newRecord.Id,
                OwnerId = newRecord.OwnerId,
                Subject = 'Generate Contract',
                Description = 'Create and send contract documents',
                Priority = 'High',
                Status = 'Not Started',
                ActivityDate = Date.today().addDays(1)
            ));
        }

        // Closed Lost - create future follow-up
        if (newRecord.Status__c == 'Closed Lost') {
            tasks.add(new Task(
                WhatId = newRecord.Id,
                OwnerId = newRecord.OwnerId,
                Subject = 'Follow Up - Lost Opportunity',
                Description = 'Check back to see if circumstances have changed',
                Priority = 'Low',
                Status = 'Not Started',
                ActivityDate = Date.today().addDays(90) // 3 months
            ));
        }

        // On Hold - create check-in task
        if (newRecord.Status__c == 'On Hold') {
            tasks.add(new Task(
                WhatId = newRecord.Id,
                OwnerId = newRecord.OwnerId,
                Subject = 'Check-in on Hold Status',
                Description = 'Verify if record can proceed or needs to be closed',
                Priority = 'Normal',
                Status = 'Not Started',
                ActivityDate = Date.today().addDays(7)
            ));
        }

        return tasks;
    }

    /**
     * Create escalation task
     */
    private static Task createEscalationTask(ObjectName record) {
        Task task = new Task();
        task.WhatId = record.Id;
        task.OwnerId = getEscalationOwner(record.OwnerId);
        task.Subject = ESCALATION_TASK.subject;
        task.Description = 'ESCALATION: ' + record.Name +
            '\nPriority: ' + record.Priority__c +
            '\nOriginal Owner: ' + record.OwnerId;
        task.Priority = 'High';
        task.Status = 'Not Started';
        task.ActivityDate = Date.today(); // Due today
        task.IsEscalation__c = true;

        return task;
    }

    /**
     * Create handoff task for owner changes
     */
    private static Task createHandoffTask(ObjectName newRecord,
                                         ObjectName oldRecord) {
        Task task = new Task();
        task.WhatId = newRecord.Id;
        task.OwnerId = newRecord.OwnerId;
        task.Subject = 'Review Transferred Record';
        task.Description = 'Record transferred from ' +
            getUserName(oldRecord.OwnerId) +
            '. Please review and take appropriate action.';
        task.Priority = 'High';
        task.Status = 'Not Started';
        task.ActivityDate = Date.today();

        return task;
    }

    /**
     * Create executive review task for high-value records
     */
    private static Task createExecutiveReviewTask(ObjectName record) {
        Task task = new Task();
        task.WhatId = record.Id;
        task.OwnerId = getExecutiveReviewer(record.OwnerId);
        task.Subject = 'Executive Review Required';
        task.Description = 'High-value record requires executive review:\n' +
            'Amount: $' + record.Amount__c.format() + '\n' +
            'Owner: ' + getUserName(record.OwnerId);
        task.Priority = 'High';
        task.Status = 'Not Started';
        task.ActivityDate = Date.today().addDays(1);

        return task;
    }

    /**
     * Create renewal tasks
     */
    private static List<Task> createRenewalTasks(ObjectName record) {
        List<Task> tasks = new List<Task>();

        // Initial renewal outreach
        tasks.add(new Task(
            WhatId = record.Id,
            OwnerId = record.OwnerId,
            Subject = 'Begin Renewal Process',
            Description = 'Contract expires ' + record.ContractEndDate__c.format() +
                '. Start renewal discussions.',
            Priority = 'High',
            Status = 'Not Started',
            ActivityDate = Date.today().addDays(7)
        ));

        // Renewal meeting
        tasks.add(new Task(
            WhatId = record.Id,
            OwnerId = record.OwnerId,
            Subject = 'Schedule Renewal Meeting',
            Description = 'Meet with stakeholders to discuss renewal',
            Priority = 'High',
            Status = 'Not Started',
            ActivityDate = Date.today().addDays(14),
            TaskSubtype = 'Meeting'
        ));

        return tasks;
    }

    /**
     * Create approval task
     */
    private static Task createApprovalTask(ObjectName record) {
        Task task = new Task();
        task.WhatId = record.Id;
        task.OwnerId = getApprover(record.OwnerId);
        task.Subject = 'Approval Required';
        task.Description = record.Name + ' requires your approval.\n' +
            'Review and approve/reject.';
        task.Priority = 'High';
        task.Status = 'Not Started';
        task.ActivityDate = Date.today().addDays(1);

        return task;
    }

    // ========================================================================
    // TASK SEQUENCING
    // ========================================================================

    /**
     * Create dependent tasks that execute in sequence
     */
    public static void createSequentialTasks(Id recordId, Id ownerId) {
        List<Task> tasks = new List<Task>();

        // Task 1: Discovery
        Task task1 = new Task(
            WhatId = recordId,
            OwnerId = ownerId,
            Subject = 'Phase 1: Discovery',
            Priority = 'High',
            Status = 'Not Started',
            ActivityDate = Date.today(),
            SequenceNumber__c = 1
        );
        tasks.add(task1);

        // Task 2: Proposal (after task 1)
        Task task2 = new Task(
            WhatId = recordId,
            OwnerId = ownerId,
            Subject = 'Phase 2: Proposal',
            Priority = 'High',
            Status = 'Waiting on others',
            ActivityDate = Date.today().addDays(7),
            SequenceNumber__c = 2,
            DependsOn__c = 'Phase 1: Discovery'
        );
        tasks.add(task2);

        // Task 3: Implementation (after task 2)
        Task task3 = new Task(
            WhatId = recordId,
            OwnerId = ownerId,
            Subject = 'Phase 3: Implementation',
            Priority = 'Normal',
            Status = 'Waiting on others',
            ActivityDate = Date.today().addDays(21),
            SequenceNumber__c = 3,
            DependsOn__c = 'Phase 2: Proposal'
        );
        tasks.add(task3);

        insert tasks;
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /**
     * Check if onboarding tasks should be created
     */
    private static Boolean shouldCreateOnboardingTasks(ObjectName record) {
        // Only create for new customers
        return record.Type__c == 'Customer' &&
               record.Status__c == 'Active';
    }

    /**
     * Check if renewal is needed
     */
    private static Boolean isRenewalNeeded(ObjectName newRecord,
                                           ObjectName oldRecord) {
        if (newRecord.ContractEndDate__c == null) return false;

        // Renewal needed if 30 days until expiration
        Date renewalDate = newRecord.ContractEndDate__c.addDays(-30);

        return renewalDate <= Date.today() &&
               oldRecord.RenewalTasksCreated__c != true;
    }

    /**
     * Get record type name
     */
    private static String getRecordTypeName(Id recordTypeId) {
        if (recordTypeId == null) return null;

        RecordType rt = [SELECT DeveloperName FROM RecordType WHERE Id = :recordTypeId];
        return rt.DeveloperName;
    }

    /**
     * Get escalation owner (manager)
     */
    private static Id getEscalationOwner(Id currentOwnerId) {
        User owner = [SELECT ManagerId FROM User WHERE Id = :currentOwnerId];
        return owner.ManagerId != null ? owner.ManagerId : currentOwnerId;
    }

    /**
     * Get executive reviewer
     */
    private static Id getExecutiveReviewer(Id currentOwnerId) {
        // Get user's manager's manager
        User owner = [
            SELECT Manager.ManagerId
            FROM User
            WHERE Id = :currentOwnerId
        ];

        return owner.Manager.ManagerId != null ?
            owner.Manager.ManagerId : currentOwnerId;
    }

    /**
     * Get approver
     */
    private static Id getApprover(Id currentOwnerId) {
        User owner = [SELECT ManagerId FROM User WHERE Id = :currentOwnerId];
        return owner.ManagerId != null ? owner.ManagerId : currentOwnerId;
    }

    /**
     * Get user name
     */
    private static String getUserName(Id userId) {
        User u = [SELECT Name FROM User WHERE Id = :userId];
        return u.Name;
    }

    // ========================================================================
    // TASK TEMPLATE CLASS
    // ========================================================================

    private class TaskTemplate {
        String subject;
        String description;
        String priority;
        Integer daysUntilDue;
        String taskType;

        TaskTemplate(String subj, String desc, String pri,
                    Integer days, String type) {
            this.subject = subj;
            this.description = desc;
            this.priority = pri;
            this.daysUntilDue = days;
            this.taskType = type;
        }
    }
}

// ============================================================================
// TEST CLASS TEMPLATE
// ============================================================================
@isTest
private class ObjectNameTaskCreationHandlerTest {

    @testSetup
    static void setup() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New',
            Amount__c = 50000
        );
        insert record;
    }

    @isTest
    static void testOnboardingTaskCreation() {
        ObjectName record = new ObjectName(
            Name = 'New Customer',
            Status__c = 'Active',
            Type__c = 'Customer'
        );

        Test.startTest();
        insert record;
        Test.stopTest();

        List<Task> tasks = [
            SELECT Id, Subject
            FROM Task
            WHERE WhatId = :record.Id
        ];

        System.assert(!tasks.isEmpty(), 'Should create onboarding tasks');
    }

    @isTest
    static void testStatusChangeTaskCreation() {
        ObjectName record = [SELECT Id, Status__c FROM ObjectName LIMIT 1];

        Test.startTest();
        record.Status__c = 'Closed Won';
        update record;
        Test.stopTest();

        List<Task> tasks = [
            SELECT Id, Subject
            FROM Task
            WHERE WhatId = :record.Id
        ];

        System.assert(!tasks.isEmpty(), 'Should create follow-up tasks');
    }

    @isTest
    static void testEscalationTaskCreation() {
        ObjectName record = [SELECT Id, IsEscalated__c FROM ObjectName LIMIT 1];

        Test.startTest();
        record.IsEscalated__c = true;
        update record;
        Test.stopTest();

        List<Task> tasks = [
            SELECT Id, Priority, IsEscalation__c
            FROM Task
            WHERE WhatId = :record.Id
        ];

        System.assertEquals(1, tasks.size(), 'Should create escalation task');
        System.assertEquals('High', tasks[0].Priority);
    }
}

/**
 * REQUIRED FIELDS:
 *   - ObjectName.DisableTaskCreation__c (Checkbox)
 *   - Task.IsAutoCreated__c (Checkbox)
 *   - Task.CreatedByAutomation__c (Checkbox)
 *   - Task.IsEscalation__c (Checkbox)
 *   - Task.SequenceNumber__c (Number)
 *   - Task.DependsOn__c (Text, 255)
 *   - ObjectName.RenewalTasksCreated__c (Checkbox)
 */
