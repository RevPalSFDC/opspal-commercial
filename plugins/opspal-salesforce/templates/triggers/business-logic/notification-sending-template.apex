/**
 * NOTIFICATION SENDING TRIGGER TEMPLATE
 *
 * Purpose: Send notifications (email, Chatter, SMS, push) on record changes
 * Use Case: Automatically notify stakeholders when:
 *   - High-value opportunity created
 *   - Record assigned to new owner
 *   - Status changes to critical state
 *   - Approval required
 *   - SLA breach imminent
 *   - Important field updated
 *   - Record shared with user
 *
 * Pattern: Event-driven notification system with multiple channels
 *
 * Notification Channels:
 *   - Email (standard and custom templates)
 *   - Chatter (posts and mentions)
 *   - Custom notifications (bell icon)
 *   - Platform events (for external systems)
 *   - SMS (via third-party integration)
 *   - Push notifications (Salesforce mobile app)
 *
 * Business Benefits:
 *   - Real-time stakeholder awareness
 *   - Reduced response times
 *   - Improved collaboration
 *   - Proactive issue management
 *   - Better customer service
 *
 * Considerations:
 *   - Email limits (5,000 per day for org)
 *   - User notification preferences
 *   - Time zone handling
 *   - Template management
 *   - Opt-out compliance
 *   - Performance (async for bulk operations)
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your actual object API name
 * [ ] Configure notification triggers and conditions
 * [ ] Set up email templates
 * [ ] Define recipient groups
 * [ ] Configure notification preferences
 * [ ] Set up escalation rules
 * [ ] Test notification delivery
 * [ ] Implement notification audit trail
 */

// ============================================================================
// TRIGGER FILE
// ============================================================================
trigger ObjectNameNotificationTrigger on ObjectName (after insert, after update) {
    ObjectNameNotificationHandler.handleTrigger();
}

// ============================================================================
// HANDLER CLASS
// ============================================================================
public class ObjectNameNotificationHandler {

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
                    sendInsertNotifications(Trigger.new);
                } else if (Trigger.isUpdate) {
                    sendUpdateNotifications(Trigger.new, Trigger.oldMap);
                }
            }

        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // CONFIGURATION
    // ========================================================================

    // High-value threshold for special alerts
    private static final Decimal HIGH_VALUE_THRESHOLD = 100000;

    // SLA warning threshold (hours before breach)
    private static final Integer SLA_WARNING_HOURS = 4;

    // Email template developer names
    private static final Map<String, String> EMAIL_TEMPLATES =
        new Map<String, String>{
            'HighValueAlert' => 'High_Value_Opportunity_Alert',
            'OwnerAssignment' => 'New_Record_Assignment',
            'StatusChange' => 'Status_Change_Notification',
            'ApprovalRequired' => 'Approval_Request',
            'SLAWarning' => 'SLA_Breach_Warning'
        };

    // Notification preferences (can be moved to custom settings)
    private static final Map<String, Boolean> NOTIFICATION_CHANNELS =
        new Map<String, Boolean>{
            'Email' => true,
            'Chatter' => true,
            'CustomNotification' => true,
            'PlatformEvent' => false
        };

    // ========================================================================
    // INSERT NOTIFICATIONS
    // ========================================================================

    /**
     * Send notifications when records are created
     */
    public static void sendInsertNotifications(List<ObjectName> newRecords) {
        List<ObjectName> highValueRecords = new List<ObjectName>();
        List<ObjectName> assignedRecords = new List<ObjectName>();

        for (ObjectName record : newRecords) {
            // High-value record alert
            if (record.Amount__c != null &&
                record.Amount__c >= HIGH_VALUE_THRESHOLD) {
                highValueRecords.add(record);
            }

            // New assignment notification
            if (record.OwnerId != null) {
                assignedRecords.add(record);
            }
        }

        // Send high-value alerts
        if (!highValueRecords.isEmpty()) {
            sendHighValueAlerts(highValueRecords);
        }

        // Send assignment notifications
        if (!assignedRecords.isEmpty()) {
            sendAssignmentNotifications(assignedRecords);
        }
    }

    // ========================================================================
    // UPDATE NOTIFICATIONS
    // ========================================================================

    /**
     * Send notifications when records are updated
     */
    public static void sendUpdateNotifications(List<ObjectName> newRecords,
                                               Map<Id, ObjectName> oldMap) {
        List<ObjectName> statusChangedRecords = new List<ObjectName>();
        List<ObjectName> ownerChangedRecords = new List<ObjectName>();
        List<ObjectName> approvalNeededRecords = new List<ObjectName>();
        List<ObjectName> slaWarningRecords = new List<ObjectName>();
        List<ObjectName> criticalFieldChangedRecords = new List<ObjectName>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Status change notification
            if (newRecord.Status__c != oldRecord.Status__c) {
                statusChangedRecords.add(newRecord);
            }

            // Owner change notification
            if (newRecord.OwnerId != oldRecord.OwnerId) {
                ownerChangedRecords.add(newRecord);
            }

            // Approval required notification
            if (newRecord.RequiresApproval__c == true &&
                oldRecord.RequiresApproval__c != true) {
                approvalNeededRecords.add(newRecord);
            }

            // SLA warning notification
            if (isSLAWarningThresholdReached(newRecord)) {
                slaWarningRecords.add(newRecord);
            }

            // Critical field change notification
            if (hasCriticalFieldChanged(newRecord, oldRecord)) {
                criticalFieldChangedRecords.add(newRecord);
            }
        }

        // Send notifications
        if (!statusChangedRecords.isEmpty()) {
            sendStatusChangeNotifications(statusChangedRecords, oldMap);
        }

        if (!ownerChangedRecords.isEmpty()) {
            sendOwnerChangeNotifications(ownerChangedRecords, oldMap);
        }

        if (!approvalNeededRecords.isEmpty()) {
            sendApprovalRequiredNotifications(approvalNeededRecords);
        }

        if (!slaWarningRecords.isEmpty()) {
            sendSLAWarningNotifications(slaWarningRecords);
        }

        if (!criticalFieldChangedRecords.isEmpty()) {
            sendCriticalFieldChangeNotifications(criticalFieldChangedRecords, oldMap);
        }
    }

    // ========================================================================
    // HIGH-VALUE ALERTS
    // ========================================================================

    /**
     * Send high-value opportunity alerts to management
     */
    private static void sendHighValueAlerts(List<ObjectName> records) {
        // Get management team
        List<User> managers = getManagementTeam();

        if (managers.isEmpty()) return;

        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (ObjectName record : records) {
            for (User manager : managers) {
                // Send email
                if (NOTIFICATION_CHANNELS.get('Email')) {
                    Messaging.SingleEmailMessage email = createEmailFromTemplate(
                        EMAIL_TEMPLATES.get('HighValueAlert'),
                        manager.Id,
                        record.Id
                    );
                    emails.add(email);
                }

                // Send custom notification
                if (NOTIFICATION_CHANNELS.get('CustomNotification')) {
                    sendCustomNotification(
                        manager.Id,
                        'High Value Alert',
                        'New high-value opportunity: ' + record.Name +
                        ' ($' + record.Amount__c + ')',
                        record.Id
                    );
                }
            }

            // Post to Chatter
            if (NOTIFICATION_CHANNELS.get('Chatter')) {
                postToChatter(
                    record.Id,
                    'New high-value opportunity created: $' +
                    record.Amount__c.format()
                );
            }
        }

        // Send emails (bulk)
        if (!emails.isEmpty()) {
            Messaging.sendEmail(emails);
        }
    }

    // ========================================================================
    // ASSIGNMENT NOTIFICATIONS
    // ========================================================================

    /**
     * Send new assignment notifications to owners
     */
    private static void sendAssignmentNotifications(List<ObjectName> records) {
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (ObjectName record : records) {
            // Send email to new owner
            if (NOTIFICATION_CHANNELS.get('Email')) {
                Messaging.SingleEmailMessage email = createEmailFromTemplate(
                    EMAIL_TEMPLATES.get('OwnerAssignment'),
                    record.OwnerId,
                    record.Id
                );
                emails.add(email);
            }

            // Send custom notification
            if (NOTIFICATION_CHANNELS.get('CustomNotification')) {
                sendCustomNotification(
                    record.OwnerId,
                    'New Assignment',
                    'You have been assigned: ' + record.Name,
                    record.Id
                );
            }

            // Post to Chatter
            if (NOTIFICATION_CHANNELS.get('Chatter')) {
                postToChatter(
                    record.Id,
                    '@[' + record.OwnerId + '] You have been assigned this record.'
                );
            }
        }

        // Send emails (bulk)
        if (!emails.isEmpty()) {
            Messaging.sendEmail(emails);
        }
    }

    // ========================================================================
    // STATUS CHANGE NOTIFICATIONS
    // ========================================================================

    /**
     * Send status change notifications
     */
    private static void sendStatusChangeNotifications(List<ObjectName> records,
                                                      Map<Id, ObjectName> oldMap) {
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (ObjectName record : records) {
            ObjectName oldRecord = oldMap.get(record.Id);

            // Only notify on certain status changes
            if (isCriticalStatusChange(oldRecord.Status__c, record.Status__c)) {

                // Send email to owner
                if (NOTIFICATION_CHANNELS.get('Email')) {
                    Messaging.SingleEmailMessage email = createEmailFromTemplate(
                        EMAIL_TEMPLATES.get('StatusChange'),
                        record.OwnerId,
                        record.Id
                    );
                    emails.add(email);
                }

                // Post to Chatter
                if (NOTIFICATION_CHANNELS.get('Chatter')) {
                    postToChatter(
                        record.Id,
                        'Status changed from ' + oldRecord.Status__c +
                        ' to ' + record.Status__c
                    );
                }

                // Send custom notification
                if (NOTIFICATION_CHANNELS.get('CustomNotification')) {
                    sendCustomNotification(
                        record.OwnerId,
                        'Status Changed',
                        record.Name + ' status changed to ' + record.Status__c,
                        record.Id
                    );
                }
            }
        }

        // Send emails (bulk)
        if (!emails.isEmpty()) {
            Messaging.sendEmail(emails);
        }
    }

    // ========================================================================
    // OWNER CHANGE NOTIFICATIONS
    // ========================================================================

    /**
     * Send owner change notifications
     */
    private static void sendOwnerChangeNotifications(List<ObjectName> records,
                                                     Map<Id, ObjectName> oldMap) {
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (ObjectName record : records) {
            ObjectName oldRecord = oldMap.get(record.Id);

            // Notify new owner
            if (NOTIFICATION_CHANNELS.get('Email')) {
                Messaging.SingleEmailMessage email = createEmailFromTemplate(
                    EMAIL_TEMPLATES.get('OwnerAssignment'),
                    record.OwnerId,
                    record.Id
                );
                emails.add(email);
            }

            // Notify old owner
            if (oldRecord.OwnerId != null) {
                if (NOTIFICATION_CHANNELS.get('CustomNotification')) {
                    sendCustomNotification(
                        oldRecord.OwnerId,
                        'Ownership Transferred',
                        record.Name + ' has been reassigned',
                        record.Id
                    );
                }
            }

            // Post to Chatter
            if (NOTIFICATION_CHANNELS.get('Chatter')) {
                postToChatter(
                    record.Id,
                    'Ownership transferred to @[' + record.OwnerId + ']'
                );
            }
        }

        // Send emails (bulk)
        if (!emails.isEmpty()) {
            Messaging.sendEmail(emails);
        }
    }

    // ========================================================================
    // APPROVAL REQUIRED NOTIFICATIONS
    // ========================================================================

    /**
     * Send approval required notifications to approvers
     */
    private static void sendApprovalRequiredNotifications(List<ObjectName> records) {
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (ObjectName record : records) {
            // Get approvers for this record
            List<Id> approverIds = getApprovers(record);

            for (Id approverId : approverIds) {
                // Send email
                if (NOTIFICATION_CHANNELS.get('Email')) {
                    Messaging.SingleEmailMessage email = createEmailFromTemplate(
                        EMAIL_TEMPLATES.get('ApprovalRequired'),
                        approverId,
                        record.Id
                    );
                    emails.add(email);
                }

                // Send custom notification
                if (NOTIFICATION_CHANNELS.get('CustomNotification')) {
                    sendCustomNotification(
                        approverId,
                        'Approval Required',
                        record.Name + ' requires your approval',
                        record.Id
                    );
                }
            }

            // Post to Chatter
            if (NOTIFICATION_CHANNELS.get('Chatter')) {
                String mentions = buildMentionString(approverIds);
                postToChatter(
                    record.Id,
                    mentions + ' Approval required for this record.'
                );
            }
        }

        // Send emails (bulk)
        if (!emails.isEmpty()) {
            Messaging.sendEmail(emails);
        }
    }

    // ========================================================================
    // SLA WARNING NOTIFICATIONS
    // ========================================================================

    /**
     * Send SLA warning notifications
     */
    private static void sendSLAWarningNotifications(List<ObjectName> records) {
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (ObjectName record : records) {
            // Send to owner
            if (NOTIFICATION_CHANNELS.get('Email')) {
                Messaging.SingleEmailMessage email = createEmailFromTemplate(
                    EMAIL_TEMPLATES.get('SLAWarning'),
                    record.OwnerId,
                    record.Id
                );
                emails.add(email);
            }

            // Send custom notification (high priority)
            if (NOTIFICATION_CHANNELS.get('CustomNotification')) {
                sendCustomNotification(
                    record.OwnerId,
                    '⚠️ SLA Warning',
                    'SLA breach imminent for: ' + record.Name,
                    record.Id
                );
            }

            // Post to Chatter with @mention
            if (NOTIFICATION_CHANNELS.get('Chatter')) {
                postToChatter(
                    record.Id,
                    '⚠️ @[' + record.OwnerId + '] SLA breach imminent! ' +
                    'Action required within ' + SLA_WARNING_HOURS + ' hours.'
                );
            }
        }

        // Send emails (bulk)
        if (!emails.isEmpty()) {
            Messaging.sendEmail(emails);
        }
    }

    // ========================================================================
    // CRITICAL FIELD CHANGE NOTIFICATIONS
    // ========================================================================

    /**
     * Send critical field change notifications
     */
    private static void sendCriticalFieldChangeNotifications(
        List<ObjectName> records,
        Map<Id, ObjectName> oldMap
    ) {
        for (ObjectName record : records) {
            ObjectName oldRecord = oldMap.get(record.Id);

            // Get changed critical fields
            Map<String, String> changes = getCriticalFieldChanges(record, oldRecord);

            if (!changes.isEmpty()) {
                // Post to Chatter with details
                if (NOTIFICATION_CHANNELS.get('Chatter')) {
                    String changeDetails = buildChangeDetailsString(changes);
                    postToChatter(
                        record.Id,
                        'Critical fields updated:\n' + changeDetails
                    );
                }

                // Send custom notification to watchers
                List<Id> watcherIds = getRecordWatchers(record.Id);
                for (Id watcherId : watcherIds) {
                    if (NOTIFICATION_CHANNELS.get('CustomNotification')) {
                        sendCustomNotification(
                            watcherId,
                            'Record Updated',
                            record.Name + ' has been updated',
                            record.Id
                        );
                    }
                }
            }
        }
    }

    // ========================================================================
    // NOTIFICATION METHODS
    // ========================================================================

    /**
     * Create email from template
     */
    private static Messaging.SingleEmailMessage createEmailFromTemplate(
        String templateName,
        Id recipientId,
        Id targetObjectId
    ) {
        EmailTemplate template = [
            SELECT Id
            FROM EmailTemplate
            WHERE DeveloperName = :templateName
            LIMIT 1
        ];

        Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
        email.setTemplateId(template.Id);
        email.setTargetObjectId(recipientId);
        email.setWhatId(targetObjectId);
        email.setSaveAsActivity(false);

        return email;
    }

    /**
     * Send custom notification (bell icon)
     */
    private static void sendCustomNotification(Id recipientId,
                                               String title,
                                               String body,
                                               Id targetId) {
        CustomNotificationType notifType = [
            SELECT Id
            FROM CustomNotificationType
            WHERE DeveloperName = 'Record_Notification'
            LIMIT 1
        ];

        Messaging.CustomNotification notification =
            new Messaging.CustomNotification();

        notification.setTitle(title);
        notification.setBody(body);
        notification.setNotificationTypeId(notifType.Id);
        notification.setTargetId(targetId);

        notification.send(new Set<String>{recipientId});
    }

    /**
     * Post to Chatter feed
     */
    private static void postToChatter(Id parentId, String message) {
        FeedItem post = new FeedItem();
        post.ParentId = parentId;
        post.Body = message;

        insert post;
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /**
     * Get management team for escalations
     */
    private static List<User> getManagementTeam() {
        return [
            SELECT Id, Email
            FROM User
            WHERE Profile.Name = 'Sales Manager'
              AND IsActive = true
        ];
    }

    /**
     * Get approvers for record
     */
    private static List<Id> getApprovers(ObjectName record) {
        // Implement approval hierarchy logic
        // This is a simplified example
        List<Id> approverIds = new List<Id>();

        // Get user's manager
        User owner = [
            SELECT Id, ManagerId
            FROM User
            WHERE Id = :record.OwnerId
        ];

        if (owner.ManagerId != null) {
            approverIds.add(owner.ManagerId);
        }

        return approverIds;
    }

    /**
     * Get watchers for record
     */
    private static List<Id> getRecordWatchers(Id recordId) {
        List<Id> watcherIds = new List<Id>();

        // Get users following the record
        List<EntitySubscription> followers = [
            SELECT SubscriberId
            FROM EntitySubscription
            WHERE ParentId = :recordId
        ];

        for (EntitySubscription sub : followers) {
            watcherIds.add(sub.SubscriberId);
        }

        return watcherIds;
    }

    /**
     * Check if status change is critical
     */
    private static Boolean isCriticalStatusChange(String oldStatus,
                                                   String newStatus) {
        Set<String> criticalStatuses = new Set<String>{
            'Escalated',
            'Urgent',
            'On Hold',
            'Cancelled'
        };

        return criticalStatuses.contains(newStatus);
    }

    /**
     * Check if SLA warning threshold reached
     */
    private static Boolean isSLAWarningThresholdReached(ObjectName record) {
        if (record.SLADueDate__c == null) return false;

        DateTime warningTime = System.now().addHours(SLA_WARNING_HOURS);

        return record.SLADueDate__c <= warningTime &&
               record.SLADueDate__c > System.now() &&
               record.Status__c != 'Completed';
    }

    /**
     * Check if critical field changed
     */
    private static Boolean hasCriticalFieldChanged(ObjectName newRecord,
                                                    ObjectName oldRecord) {
        Set<String> criticalFields = new Set<String>{
            'Amount__c',
            'Priority__c',
            'DueDate__c',
            'Status__c'
        };

        for (String field : criticalFields) {
            if (newRecord.get(field) != oldRecord.get(field)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get critical field changes
     */
    private static Map<String, String> getCriticalFieldChanges(
        ObjectName newRecord,
        ObjectName oldRecord
    ) {
        Map<String, String> changes = new Map<String, String>();

        Set<String> criticalFields = new Set<String>{
            'Amount__c',
            'Priority__c',
            'DueDate__c',
            'Status__c'
        };

        for (String field : criticalFields) {
            Object oldValue = oldRecord.get(field);
            Object newValue = newRecord.get(field);

            if (oldValue != newValue) {
                changes.put(field, String.valueOf(oldValue) + ' → ' +
                          String.valueOf(newValue));
            }
        }

        return changes;
    }

    /**
     * Build mention string for multiple users
     */
    private static String buildMentionString(List<Id> userIds) {
        List<String> mentions = new List<String>();

        for (Id userId : userIds) {
            mentions.add('@[' + userId + ']');
        }

        return String.join(mentions, ' ');
    }

    /**
     * Build change details string
     */
    private static String buildChangeDetailsString(Map<String, String> changes) {
        List<String> lines = new List<String>();

        for (String field : changes.keySet()) {
            lines.add('• ' + field + ': ' + changes.get(field));
        }

        return String.join(lines, '\n');
    }
}

// ============================================================================
// TEST CLASS TEMPLATE
// ============================================================================
@isTest
private class ObjectNameNotificationHandlerTest {

    @testSetup
    static void setup() {
        // Create test records
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'New',
            Amount__c = 50000
        );
        insert record;
    }

    @isTest
    static void testHighValueAlert() {
        Test.startTest();
        ObjectName highValue = new ObjectName(
            Name = 'High Value Record',
            Status__c = 'New',
            Amount__c = 150000
        );
        insert highValue;
        Test.stopTest();

        // Verify Chatter post created
        List<FeedItem> posts = [
            SELECT Id, Body
            FROM FeedItem
            WHERE ParentId = :highValue.Id
        ];

        System.assert(!posts.isEmpty(), 'Should create Chatter post');
    }

    @isTest
    static void testStatusChangeNotification() {
        ObjectName record = [SELECT Id, Status__c FROM ObjectName LIMIT 1];

        Test.startTest();
        record.Status__c = 'Escalated';
        update record;
        Test.stopTest();

        // Verify notification sent
        List<FeedItem> posts = [
            SELECT Id, Body
            FROM FeedItem
            WHERE ParentId = :record.Id
        ];

        System.assert(!posts.isEmpty(), 'Should create status change notification');
    }
}

/**
 * REQUIRED CUSTOM NOTIFICATION TYPE:
 *   - DeveloperName: Record_Notification
 *   - Desktop: true
 *   - Mobile: true
 *
 * REQUIRED EMAIL TEMPLATES:
 *   - High_Value_Opportunity_Alert
 *   - New_Record_Assignment
 *   - Status_Change_Notification
 *   - Approval_Request
 *   - SLA_Breach_Warning
 */
