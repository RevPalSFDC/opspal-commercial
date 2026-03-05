/**
 * STAGE AUTOMATION TRIGGER TEMPLATE
 *
 * Purpose: Automate stage/status progression based on field values and conditions
 * Use Case: Automatically advance records through stages/statuses when:
 *   - All required fields are completed → Move to next stage
 *   - All milestones completed → Mark project complete
 *   - Approval received → Progress to next phase
 *   - Specific criteria met → Auto-advance workflow
 *   - Time-based progression → Scheduled stage changes
 *
 * Pattern: Rule-based stage progression with validation and rollback
 *
 * Business Benefits:
 *   - Reduces manual status updates
 *   - Ensures consistent workflow progression
 *   - Enforces business process compliance
 *   - Improves data quality and completeness
 *   - Provides audit trail of stage changes
 *
 * Stage Progression Types:
 *   - Linear progression (Stage 1 → 2 → 3)
 *   - Conditional branching (different paths based on criteria)
 *   - Milestone-based progression (all tasks complete → advance)
 *   - Approval-based progression (approved → next stage)
 *   - Time-based progression (auto-advance after X days)
 *
 * Considerations:
 *   - Stage validation rules
 *   - Required fields per stage
 *   - User permissions for stage changes
 *   - Rollback scenarios
 *   - Stage-specific automation (email alerts, task creation)
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your actual object API name
 * [ ] Define stage progression rules
 * [ ] Configure required fields per stage
 * [ ] Set up stage transition validations
 * [ ] Configure stage-specific automation
 * [ ] Set up approval integration
 * [ ] Create stage change audit trail
 * [ ] Test all stage transitions
 */

// ============================================================================
// TRIGGER FILE
// ============================================================================
trigger ObjectNameStageAutomationTrigger on ObjectName (before update, after update) {
    ObjectNameStageAutomationHandler.handleTrigger();
}

// ============================================================================
// HANDLER CLASS
// ============================================================================
public class ObjectNameStageAutomationHandler {

    // Recursion prevention
    private static Boolean isExecuting = false;

    public static void handleTrigger() {
        // Prevent recursion
        if (isExecuting) {
            return;
        }

        try {
            isExecuting = true;

            if (Trigger.isBefore && Trigger.isUpdate) {
                validateStageTransitions(Trigger.new, Trigger.oldMap);
                autoAdvanceStages(Trigger.new, Trigger.oldMap);
            }

            if (Trigger.isAfter && Trigger.isUpdate) {
                executeStageActions(Trigger.new, Trigger.oldMap);
            }

        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // STAGE CONFIGURATION
    // ========================================================================

    // Define stage progression order
    private static final List<String> STAGE_ORDER = new List<String>{
        'New',
        'Qualified',
        'Proposal',
        'Negotiation',
        'Closed Won',
        'Closed Lost'
    };

    // Define allowed stage transitions (from => to)
    private static final Map<String, Set<String>> ALLOWED_TRANSITIONS =
        new Map<String, Set<String>>{
            'New' => new Set<String>{'Qualified', 'Closed Lost'},
            'Qualified' => new Set<String>{'Proposal', 'Closed Lost'},
            'Proposal' => new Set<String>{'Negotiation', 'Qualified', 'Closed Lost'},
            'Negotiation' => new Set<String>{'Closed Won', 'Proposal', 'Closed Lost'},
            'Closed Won' => new Set<String>{}, // Terminal state
            'Closed Lost' => new Set<String>{'Qualified'} // Can reopen
        };

    // Required fields per stage
    private static final Map<String, Set<String>> REQUIRED_FIELDS_BY_STAGE =
        new Map<String, Set<String>>{
            'Qualified' => new Set<String>{'Budget__c', 'Timeline__c', 'DecisionMaker__c'},
            'Proposal' => new Set<String>{'ProposalSentDate__c', 'Amount'},
            'Negotiation' => new Set<String>{'ContractTerms__c', 'CloseDate'},
            'Closed Won' => new Set<String>{'Amount', 'CloseDate', 'WonReason__c'}
        };

    // Auto-advance criteria
    private static final Map<String, String> AUTO_ADVANCE_CRITERIA =
        new Map<String, String>{
            'Qualified' => 'BANT_Complete__c = true',
            'Proposal' => 'Proposal_Accepted__c = true',
            'Negotiation' => 'Contract_Signed__c = true'
        };

    // ========================================================================
    // STAGE VALIDATION
    // ========================================================================

    /**
     * Validate stage transitions before update
     */
    public static void validateStageTransitions(List<ObjectName> newRecords,
                                                Map<Id, ObjectName> oldMap) {
        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Check if stage changed
            if (newRecord.StageName != oldRecord.StageName) {

                // Validate transition is allowed
                if (!isTransitionAllowed(oldRecord.StageName, newRecord.StageName)) {
                    newRecord.addError('Invalid stage transition from ' +
                        oldRecord.StageName + ' to ' + newRecord.StageName);
                    continue;
                }

                // Validate required fields are populated
                Set<String> missingFields = getMissingRequiredFields(
                    newRecord,
                    newRecord.StageName
                );

                if (!missingFields.isEmpty()) {
                    newRecord.addError('Cannot advance to ' + newRecord.StageName +
                        '. Missing required fields: ' +
                        String.join(new List<String>(missingFields), ', '));
                    continue;
                }

                // Validate business rules
                String validationError = validateBusinessRules(newRecord, oldRecord);
                if (validationError != null) {
                    newRecord.addError(validationError);
                    continue;
                }

                // Track stage change
                newRecord.PreviousStage__c = oldRecord.StageName;
                newRecord.StageChangedDate__c = System.now();
                newRecord.StageChangedBy__c = UserInfo.getUserId();
            }
        }
    }

    /**
     * Check if stage transition is allowed
     */
    private static Boolean isTransitionAllowed(String fromStage, String toStage) {
        if (fromStage == toStage) {
            return true; // No transition
        }

        Set<String> allowedNextStages = ALLOWED_TRANSITIONS.get(fromStage);

        if (allowedNextStages == null) {
            return false; // No transitions defined
        }

        return allowedNextStages.contains(toStage);
    }

    /**
     * Get missing required fields for target stage
     */
    private static Set<String> getMissingRequiredFields(ObjectName record,
                                                        String targetStage) {
        Set<String> missingFields = new Set<String>();

        Set<String> requiredFields = REQUIRED_FIELDS_BY_STAGE.get(targetStage);

        if (requiredFields == null) {
            return missingFields; // No requirements
        }

        for (String fieldName : requiredFields) {
            Object value = record.get(fieldName);
            if (value == null || String.valueOf(value).trim() == '') {
                missingFields.add(fieldName);
            }
        }

        return missingFields;
    }

    /**
     * Validate business rules for stage transition
     */
    private static String validateBusinessRules(ObjectName newRecord,
                                                ObjectName oldRecord) {
        // Example: Cannot close without amount
        if ((newRecord.StageName == 'Closed Won' ||
             newRecord.StageName == 'Closed Lost') &&
            (newRecord.Amount == null || newRecord.Amount <= 0)) {
            return 'Amount must be greater than zero to close';
        }

        // Example: Cannot move to Negotiation without approval
        if (newRecord.StageName == 'Negotiation' &&
            newRecord.IsApproved__c != true &&
            newRecord.Amount > 100000) {
            return 'Approval required for opportunities over $100K before negotiation';
        }

        // Example: Cannot skip stages
        Integer oldIndex = STAGE_ORDER.indexOf(oldRecord.StageName);
        Integer newIndex = STAGE_ORDER.indexOf(newRecord.StageName);

        if (newIndex > oldIndex + 2) {
            return 'Cannot skip stages. Must progress sequentially.';
        }

        return null; // All validations passed
    }

    // ========================================================================
    // AUTO-ADVANCE LOGIC
    // ========================================================================

    /**
     * Automatically advance stages based on criteria
     */
    public static void autoAdvanceStages(List<ObjectName> newRecords,
                                         Map<Id, ObjectName> oldMap) {
        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Skip if stage manually changed
            if (newRecord.StageName != oldRecord.StageName) {
                continue;
            }

            // Skip if auto-advance disabled
            if (newRecord.DisableAutoAdvance__c == true) {
                continue;
            }

            // Check if criteria met to auto-advance
            String nextStage = getNextAutoAdvanceStage(newRecord);

            if (nextStage != null) {
                newRecord.StageName = nextStage;
                newRecord.AutoAdvanced__c = true;
                newRecord.AutoAdvanceDate__c = System.now();
            }
        }
    }

    /**
     * Determine next stage for auto-advance
     */
    private static String getNextAutoAdvanceStage(ObjectName record) {
        // Check milestone-based progression
        if (record.StageName == 'New' &&
            allMilestonesComplete(record.Id, 'Discovery')) {
            return 'Qualified';
        }

        if (record.StageName == 'Qualified' &&
            allMilestonesComplete(record.Id, 'Proposal')) {
            return 'Proposal';
        }

        // Check field-based criteria
        for (String targetStage : AUTO_ADVANCE_CRITERIA.keySet()) {
            if (record.StageName != targetStage) {
                String criteria = AUTO_ADVANCE_CRITERIA.get(targetStage);

                if (evaluateCriteria(record, criteria)) {
                    return getNextStage(record.StageName);
                }
            }
        }

        // Check time-based progression
        if (record.StageName == 'Proposal' &&
            record.ProposalSentDate__c != null &&
            record.ProposalSentDate__c.addDays(30) < Date.today()) {
            // Auto-advance to negotiation after 30 days
            return 'Negotiation';
        }

        return null; // No auto-advance
    }

    /**
     * Get next stage in linear progression
     */
    private static String getNextStage(String currentStage) {
        Integer currentIndex = STAGE_ORDER.indexOf(currentStage);

        if (currentIndex >= 0 && currentIndex < STAGE_ORDER.size() - 1) {
            return STAGE_ORDER[currentIndex + 1];
        }

        return null;
    }

    /**
     * Check if all milestones for phase are complete
     */
    private static Boolean allMilestonesComplete(Id recordId, String phase) {
        List<Milestone__c> milestones = [
            SELECT Id, Status__c
            FROM Milestone__c
            WHERE ParentId__c = :recordId
              AND Phase__c = :phase
        ];

        if (milestones.isEmpty()) {
            return false; // No milestones = not complete
        }

        for (Milestone__c milestone : milestones) {
            if (milestone.Status__c != 'Completed') {
                return false;
            }
        }

        return true; // All completed
    }

    /**
     * Evaluate criteria string (simplified)
     */
    private static Boolean evaluateCriteria(ObjectName record, String criteria) {
        // Simplified evaluation - in production use dynamic SOQL or formula parser

        if (criteria.contains('BANT_Complete__c = true')) {
            return record.BANT_Complete__c == true;
        }

        if (criteria.contains('Proposal_Accepted__c = true')) {
            return record.Proposal_Accepted__c == true;
        }

        if (criteria.contains('Contract_Signed__c = true')) {
            return record.Contract_Signed__c == true;
        }

        return false;
    }

    // ========================================================================
    // STAGE-SPECIFIC ACTIONS
    // ========================================================================

    /**
     * Execute actions when stage changes
     */
    public static void executeStageActions(List<ObjectName> newRecords,
                                           Map<Id, ObjectName> oldMap) {
        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Check if stage changed
            if (newRecord.StageName != oldRecord.StageName) {

                // Execute stage-specific actions
                if (newRecord.StageName == 'Qualified') {
                    onQualified(newRecord);
                } else if (newRecord.StageName == 'Proposal') {
                    onProposal(newRecord);
                } else if (newRecord.StageName == 'Negotiation') {
                    onNegotiation(newRecord);
                } else if (newRecord.StageName == 'Closed Won') {
                    onClosedWon(newRecord);
                } else if (newRecord.StageName == 'Closed Lost') {
                    onClosedLost(newRecord);
                }

                // Create stage change audit record
                createStageAudit(newRecord, oldRecord);
            }
        }
    }

    /**
     * Actions when entering Qualified stage
     */
    private static void onQualified(ObjectName record) {
        // Create tasks for next steps
        createQualificationTasks(record.Id);

        // Send notification to sales manager
        sendNotification(record.OwnerId, 'Opportunity Qualified',
            'Opportunity ' + record.Name + ' has been qualified.');

        // Update probability
        // (Done in separate method to avoid multiple updates)
    }

    /**
     * Actions when entering Proposal stage
     */
    private static void onProposal(ObjectName record) {
        // Create proposal tasks
        createProposalTasks(record.Id);

        // Generate quote (if CPQ integration)
        // generateQuote(record.Id);

        // Send notification
        sendNotification(record.OwnerId, 'Proposal Stage',
            'Opportunity ' + record.Name + ' is ready for proposal.');
    }

    /**
     * Actions when entering Negotiation stage
     */
    private static void onNegotiation(ObjectName record) {
        // Create contract review tasks
        createNegotiationTasks(record.Id);

        // Request legal review (if high value)
        if (record.Amount > 100000) {
            // requestLegalReview(record.Id);
        }
    }

    /**
     * Actions when Closed Won
     */
    private static void onClosedWon(ObjectName record) {
        // Create onboarding tasks
        createOnboardingTasks(record.Id);

        // Create contract record
        // createContract(record.Id);

        // Send congratulations email
        sendNotification(record.OwnerId, 'Congratulations!',
            'Opportunity ' + record.Name + ' is now Closed Won!');
    }

    /**
     * Actions when Closed Lost
     */
    private static void onClosedLost(ObjectName record) {
        // Create follow-up task for future
        createFollowUpTask(record.Id, 90); // Follow up in 90 days

        // Request feedback
        // requestLossFeedback(record.Id);
    }

    // ========================================================================
    // TASK CREATION
    // ========================================================================

    private static void createQualificationTasks(Id recordId) {
        List<Task> tasks = new List<Task>();

        tasks.add(new Task(
            WhatId = recordId,
            Subject = 'Complete BANT qualification',
            Priority = 'High',
            Status = 'Not Started',
            ActivityDate = Date.today().addDays(3)
        ));

        tasks.add(new Task(
            WhatId = recordId,
            Subject = 'Identify decision makers',
            Priority = 'High',
            Status = 'Not Started',
            ActivityDate = Date.today().addDays(5)
        ));

        insert tasks;
    }

    private static void createProposalTasks(Id recordId) {
        List<Task> tasks = new List<Task>();

        tasks.add(new Task(
            WhatId = recordId,
            Subject = 'Prepare proposal document',
            Priority = 'High',
            Status = 'Not Started',
            ActivityDate = Date.today().addDays(5)
        ));

        insert tasks;
    }

    private static void createNegotiationTasks(Id recordId) {
        List<Task> tasks = new List<Task>();

        tasks.add(new Task(
            WhatId = recordId,
            Subject = 'Review contract terms',
            Priority = 'High',
            Status = 'Not Started',
            ActivityDate = Date.today().addDays(2)
        ));

        insert tasks;
    }

    private static void createOnboardingTasks(Id recordId) {
        List<Task> tasks = new List<Task>();

        tasks.add(new Task(
            WhatId = recordId,
            Subject = 'Schedule kickoff meeting',
            Priority = 'High',
            Status = 'Not Started',
            ActivityDate = Date.today().addDays(3)
        ));

        insert tasks;
    }

    private static void createFollowUpTask(Id recordId, Integer daysInFuture) {
        Task followUp = new Task(
            WhatId = recordId,
            Subject = 'Follow up on lost opportunity',
            Priority = 'Normal',
            Status = 'Not Started',
            ActivityDate = Date.today().addDays(daysInFuture)
        );

        insert followUp;
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    private static void sendNotification(Id userId, String subject, String body) {
        // Implement notification logic (email, Chatter, platform event)
        // Example: Send Chatter notification
        // FeedItem post = new FeedItem(
        //     ParentId = userId,
        //     Body = body
        // );
        // insert post;
    }

    private static void createStageAudit(ObjectName newRecord, ObjectName oldRecord) {
        StageChangeAudit__c audit = new StageChangeAudit__c();
        audit.RecordId__c = newRecord.Id;
        audit.RecordName__c = newRecord.Name;
        audit.OldStage__c = oldRecord.StageName;
        audit.NewStage__c = newRecord.StageName;
        audit.ChangedBy__c = UserInfo.getUserId();
        audit.ChangedDate__c = System.now();
        audit.WasAutoAdvanced__c = newRecord.AutoAdvanced__c;

        insert audit;
    }
}

// ============================================================================
// TEST CLASS TEMPLATE
// ============================================================================
@isTest
private class ObjectNameStageAutomationHandlerTest {

    @testSetup
    static void setup() {
        // Create test records
        List<ObjectName> records = new List<ObjectName>();
        records.add(new ObjectName(
            Name = 'Test Opp 1',
            StageName = 'New',
            Amount = 50000,
            CloseDate = Date.today().addDays(30)
        ));
        insert records;
    }

    @isTest
    static void testValidStageTransition() {
        ObjectName opp = [SELECT Id, StageName FROM ObjectName LIMIT 1];

        // Populate required fields for Qualified
        opp.Budget__c = 50000;
        opp.Timeline__c = '30 days';
        opp.DecisionMaker__c = 'John Smith';

        Test.startTest();
        opp.StageName = 'Qualified';
        update opp;
        Test.stopTest();

        opp = [SELECT StageName, PreviousStage__c FROM ObjectName WHERE Id = :opp.Id];
        System.assertEquals('Qualified', opp.StageName);
        System.assertEquals('New', opp.PreviousStage__c);
    }

    @isTest
    static void testInvalidStageTransition() {
        ObjectName opp = [SELECT Id, StageName FROM ObjectName LIMIT 1];

        Test.startTest();
        try {
            opp.StageName = 'Closed Won'; // Skip stages
            update opp;
            System.assert(false, 'Should have thrown error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Invalid stage transition'));
        }
        Test.stopTest();
    }

    @isTest
    static void testMissingRequiredFields() {
        ObjectName opp = [SELECT Id, StageName FROM ObjectName LIMIT 1];

        Test.startTest();
        try {
            opp.StageName = 'Qualified'; // Missing required fields
            update opp;
            System.assert(false, 'Should have thrown error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Missing required fields'));
        }
        Test.stopTest();
    }

    @isTest
    static void testAutoAdvance() {
        ObjectName opp = [SELECT Id, StageName FROM ObjectName LIMIT 1];

        // Set criteria for auto-advance
        opp.BANT_Complete__c = true;

        Test.startTest();
        update opp;
        Test.stopTest();

        opp = [SELECT StageName, AutoAdvanced__c FROM ObjectName WHERE Id = :opp.Id];
        System.assertEquals('Qualified', opp.StageName);
        System.assertEquals(true, opp.AutoAdvanced__c);
    }
}

/**
 * REQUIRED FIELDS:
 *   - ObjectName.PreviousStage__c (Text, 255)
 *   - ObjectName.StageChangedDate__c (DateTime)
 *   - ObjectName.StageChangedBy__c (Lookup to User)
 *   - ObjectName.DisableAutoAdvance__c (Checkbox)
 *   - ObjectName.AutoAdvanced__c (Checkbox)
 *   - ObjectName.AutoAdvanceDate__c (DateTime)
 *
 * OPTIONAL CUSTOM OBJECT: StageChangeAudit__c
 * Fields:
 *   - RecordId__c (Text, 18)
 *   - RecordName__c (Text, 255)
 *   - OldStage__c (Text, 255)
 *   - NewStage__c (Text, 255)
 *   - ChangedBy__c (Lookup to User)
 *   - ChangedDate__c (DateTime)
 *   - WasAutoAdvanced__c (Checkbox)
 */
