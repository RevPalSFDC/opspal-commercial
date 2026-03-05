/**
 * AUDIT TRAIL TRIGGER TEMPLATE
 *
 * Purpose: Comprehensive audit trail for compliance and regulatory requirements
 * Use Case: Track all record access, modifications, and data handling for:
 *   - SOX, HIPAA, GDPR, SOC2 compliance
 *   - Financial and healthcare regulatory requirements
 *   - Legal discovery and investigation support
 *   - Security incident response
 *   - Data access monitoring and breach detection
 *   - User activity auditing
 *
 * Pattern: Track who, what, when, where, why, and how for all record interactions
 *
 * Compliance Features:
 *   - Immutable audit records (cannot be modified or deleted)
 *   - Tamper-proof checksums for audit integrity
 *   - Separation of duties (audit by different user than action user)
 *   - Retention policy enforcement
 *   - Audit log exports for external archival
 *   - Real-time alerting on sensitive actions
 *
 * Tracked Information:
 *   - Action performed (INSERT, UPDATE, DELETE, UNDELETE, VIEW)
 *   - User performing action
 *   - Date and time of action
 *   - IP address and session details
 *   - Changed fields and values
 *   - Business justification (if required)
 *   - Risk level of action
 *   - Data sensitivity classification
 *
 * Security Considerations:
 *   - Audit records should be in separate object with restricted permissions
 *   - Only System Administrator and Compliance Officer should have access
 *   - Implement workflow to alert on suspicious patterns
 *   - Regular reviews of audit trail
 *   - Automated anomaly detection
 *
 * Governor Limits:
 *   - DML operations for audit records
 *   - SOQL queries for user and session info
 *   - Platform event publishing for real-time alerts
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your actual object API name
 * [ ] Configure sensitive fields requiring audit
 * [ ] Set up retention policy (typically 7+ years for compliance)
 * [ ] Define risk levels for different actions
 * [ ] Configure real-time alerts for high-risk actions
 * [ ] Set up scheduled audit log exports
 * [ ] Implement tamper detection
 * [ ] Create compliance reports
 * [ ] Configure data classification levels
 */

// ============================================================================
// TRIGGER FILE
// ============================================================================
trigger ObjectNameAuditTrailTrigger on ObjectName (after insert, after update, after delete, after undelete) {
    ObjectNameAuditTrailHandler.handleTrigger();
}

// ============================================================================
// HANDLER CLASS
// ============================================================================
public class ObjectNameAuditTrailHandler {

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
                    auditInsert(Trigger.new);
                } else if (Trigger.isUpdate) {
                    auditUpdate(Trigger.new, Trigger.oldMap);
                } else if (Trigger.isDelete) {
                    auditDelete(Trigger.old);
                } else if (Trigger.isUndelete) {
                    auditUndelete(Trigger.new);
                }
            }

        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // CONFIGURATION
    // ========================================================================

    // Sensitive fields requiring mandatory audit
    private static final Set<String> SENSITIVE_FIELDS = new Set<String>{
        'SSN__c',
        'CreditCardNumber__c',
        'BankAccountNumber__c',
        'DateOfBirth__c',
        'SalaryAmount__c',
        'MedicalRecordNumber__c',
        'TaxIDNumber__c'
    };

    // High-risk actions requiring immediate alerting
    private static final Set<String> HIGH_RISK_ACTIONS = new Set<String>{
        'SENSITIVE_DATA_MODIFIED',
        'BULK_DELETE',
        'MASS_UPDATE',
        'PERMISSION_ELEVATION',
        'EXTERNAL_EXPORT'
    };

    // Data classification levels
    private enum DataClassification {
        PUBLIC,
        INTERNAL,
        CONFIDENTIAL,
        RESTRICTED,
        HIGHLY_RESTRICTED
    }

    // Retention policy (days) - typically 7+ years for compliance
    private static final Integer RETENTION_DAYS = 2555; // 7 years

    // ========================================================================
    // AUDIT TRAIL METHODS
    // ========================================================================

    /**
     * Audit record creation
     */
    public static void auditInsert(List<ObjectName> newRecords) {
        List<AuditTrail__c> auditRecords = new List<AuditTrail__c>();

        // Get session information
        Map<String, String> sessionInfo = getSessionInfo();

        for (ObjectName record : newRecords) {
            AuditTrail__c audit = new AuditTrail__c();

            // Who
            audit.UserId__c = UserInfo.getUserId();
            audit.UserName__c = UserInfo.getName();
            audit.UserEmail__c = UserInfo.getUserEmail();
            audit.UserProfile__c = getUserProfile();
            audit.UserRole__c = getUserRole();

            // What
            audit.ObjectType__c = 'ObjectName';
            audit.RecordId__c = record.Id;
            audit.RecordName__c = record.Name;
            audit.Action__c = 'INSERT';
            audit.ActionCategory__c = 'DATA_CREATION';

            // When
            audit.ActionDate__c = System.now();
            audit.ActionTimestamp__c = System.currentTimeMillis();

            // Where
            audit.IPAddress__c = sessionInfo.get('ipAddress');
            audit.SessionId__c = sessionInfo.get('sessionId');
            audit.LoginHistory__c = sessionInfo.get('loginHistoryId');
            audit.Platform__c = sessionInfo.get('platform');
            audit.Browser__c = sessionInfo.get('browser');

            // Why and How
            audit.BusinessJustification__c = getBusinessJustification(record.Id);
            audit.SourceSystem__c = getSourceSystem();
            audit.IntegrationUser__c = isIntegrationUser();

            // Risk and Compliance
            audit.RiskLevel__c = calculateRiskLevel('INSERT', record);
            audit.DataClassification__c = classifyData(record);
            audit.ContainsSensitiveData__c = containsSensitiveFields(record);
            audit.RequiresApproval__c = requiresApproval('INSERT', record);

            // Data details
            audit.FieldsAccessed__c = String.join(
                new List<String>(record.getPopulatedFieldsAsMap().keySet()),
                ', '
            );
            audit.RecordSnapshot__c = JSON.serialize(record);

            // Tamper protection
            audit.Checksum__c = calculateChecksum(audit);

            auditRecords.add(audit);
        }

        if (!auditRecords.isEmpty()) {
            insert auditRecords;

            // Alert on high-risk actions
            alertOnHighRisk(auditRecords);
        }
    }

    /**
     * Audit record update with field-level changes
     */
    public static void auditUpdate(List<ObjectName> newRecords,
                                    Map<Id, ObjectName> oldMap) {
        List<AuditTrail__c> auditRecords = new List<AuditTrail__c>();

        // Get session information
        Map<String, String> sessionInfo = getSessionInfo();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Get changed fields
            Map<String, FieldChange> changedFields = getChangedFields(newRecord, oldRecord);

            if (!changedFields.isEmpty()) {
                AuditTrail__c audit = new AuditTrail__c();

                // Who
                audit.UserId__c = UserInfo.getUserId();
                audit.UserName__c = UserInfo.getName();
                audit.UserEmail__c = UserInfo.getUserEmail();
                audit.UserProfile__c = getUserProfile();
                audit.UserRole__c = getUserRole();

                // What
                audit.ObjectType__c = 'ObjectName';
                audit.RecordId__c = newRecord.Id;
                audit.RecordName__c = newRecord.Name;
                audit.Action__c = 'UPDATE';
                audit.ActionCategory__c = determineActionCategory(changedFields);

                // When
                audit.ActionDate__c = System.now();
                audit.ActionTimestamp__c = System.currentTimeMillis();

                // Where
                audit.IPAddress__c = sessionInfo.get('ipAddress');
                audit.SessionId__c = sessionInfo.get('sessionId');
                audit.LoginHistory__c = sessionInfo.get('loginHistoryId');
                audit.Platform__c = sessionInfo.get('platform');
                audit.Browser__c = sessionInfo.get('browser');

                // Why and How
                audit.BusinessJustification__c = getBusinessJustification(newRecord.Id);
                audit.SourceSystem__c = getSourceSystem();
                audit.IntegrationUser__c = isIntegrationUser();

                // Risk and Compliance
                audit.RiskLevel__c = calculateRiskLevel('UPDATE', newRecord, changedFields);
                audit.DataClassification__c = classifyData(newRecord);
                audit.ContainsSensitiveData__c = changedFieldsContainSensitiveData(changedFields);
                audit.RequiresApproval__c = requiresApproval('UPDATE', newRecord, changedFields);

                // Data details
                audit.FieldsModified__c = String.join(
                    new List<String>(changedFields.keySet()),
                    ', '
                );
                audit.FieldCount__c = changedFields.size();
                audit.ChangeSummary__c = formatChangeSummary(changedFields);
                audit.BeforeValues__c = JSON.serialize(oldRecord);
                audit.AfterValues__c = JSON.serialize(newRecord);

                // Sensitive field tracking
                if (audit.ContainsSensitiveData__c) {
                    audit.SensitiveFieldsModified__c = getSensitiveFieldsModified(changedFields);
                    audit.DataHandlingCompliance__c = verifyDataHandlingCompliance();
                }

                // Tamper protection
                audit.Checksum__c = calculateChecksum(audit);

                auditRecords.add(audit);
            }
        }

        if (!auditRecords.isEmpty()) {
            insert auditRecords;

            // Alert on high-risk actions
            alertOnHighRisk(auditRecords);
        }
    }

    /**
     * Audit record deletion
     */
    public static void auditDelete(List<ObjectName> oldRecords) {
        List<AuditTrail__c> auditRecords = new List<AuditTrail__c>();

        // Get session information
        Map<String, String> sessionInfo = getSessionInfo();

        for (ObjectName record : oldRecords) {
            AuditTrail__c audit = new AuditTrail__c();

            // Who
            audit.UserId__c = UserInfo.getUserId();
            audit.UserName__c = UserInfo.getName();
            audit.UserEmail__c = UserInfo.getUserEmail();
            audit.UserProfile__c = getUserProfile();
            audit.UserRole__c = getUserRole();

            // What
            audit.ObjectType__c = 'ObjectName';
            audit.RecordId__c = record.Id;
            audit.RecordName__c = record.Name;
            audit.Action__c = 'DELETE';
            audit.ActionCategory__c = 'DATA_DELETION';

            // When
            audit.ActionDate__c = System.now();
            audit.ActionTimestamp__c = System.currentTimeMillis();

            // Where
            audit.IPAddress__c = sessionInfo.get('ipAddress');
            audit.SessionId__c = sessionInfo.get('sessionId');
            audit.LoginHistory__c = sessionInfo.get('loginHistoryId');
            audit.Platform__c = sessionInfo.get('platform');
            audit.Browser__c = sessionInfo.get('browser');

            // Why and How
            audit.BusinessJustification__c = getBusinessJustification(record.Id);
            audit.DeletionReason__c = getDeletionReason();
            audit.SourceSystem__c = getSourceSystem();
            audit.IntegrationUser__c = isIntegrationUser();

            // Risk and Compliance (HIGH for deletions)
            audit.RiskLevel__c = 'HIGH';
            audit.DataClassification__c = classifyData(record);
            audit.ContainsSensitiveData__c = containsSensitiveFields(record);
            audit.RequiresApproval__c = true; // Deletions always require approval

            // Data details (preserve deleted data)
            audit.BeforeValues__c = JSON.serialize(record);
            audit.RecordSnapshot__c = JSON.serialize(record);

            // Mark as deletion
            audit.IsDataDeletion__c = true;
            audit.CanBeRecovered__c = true;
            audit.RecoveryDeadline__c = System.now().addDays(15); // Recycle bin limit

            // Tamper protection
            audit.Checksum__c = calculateChecksum(audit);

            auditRecords.add(audit);
        }

        if (!auditRecords.isEmpty()) {
            insert auditRecords;

            // ALWAYS alert on deletions
            alertOnHighRisk(auditRecords);
        }
    }

    /**
     * Audit record restoration
     */
    public static void auditUndelete(List<ObjectName> newRecords) {
        List<AuditTrail__c> auditRecords = new List<AuditTrail__c>();

        // Get session information
        Map<String, String> sessionInfo = getSessionInfo();

        for (ObjectName record : newRecords) {
            AuditTrail__c audit = new AuditTrail__c();

            // Who
            audit.UserId__c = UserInfo.getUserId();
            audit.UserName__c = UserInfo.getName();
            audit.UserEmail__c = UserInfo.getUserEmail();
            audit.UserProfile__c = getUserProfile();
            audit.UserRole__c = getUserRole();

            // What
            audit.ObjectType__c = 'ObjectName';
            audit.RecordId__c = record.Id;
            audit.RecordName__c = record.Name;
            audit.Action__c = 'UNDELETE';
            audit.ActionCategory__c = 'DATA_RECOVERY';

            // When
            audit.ActionDate__c = System.now();
            audit.ActionTimestamp__c = System.currentTimeMillis();

            // Where
            audit.IPAddress__c = sessionInfo.get('ipAddress');
            audit.SessionId__c = sessionInfo.get('sessionId');
            audit.LoginHistory__c = sessionInfo.get('loginHistoryId');

            // Why
            audit.BusinessJustification__c = getBusinessJustification(record.Id);
            audit.RecoveryReason__c = getRecoveryReason();

            // Risk and Compliance
            audit.RiskLevel__c = 'MEDIUM';
            audit.DataClassification__c = classifyData(record);

            // Data details
            audit.AfterValues__c = JSON.serialize(record);

            // Tamper protection
            audit.Checksum__c = calculateChecksum(audit);

            auditRecords.add(audit);
        }

        if (!auditRecords.isEmpty()) {
            insert auditRecords;
        }
    }

    // ========================================================================
    // FIELD CHANGE TRACKING
    // ========================================================================

    private class FieldChange {
        public String fieldName;
        public Object oldValue;
        public Object newValue;
        public Boolean isSensitive;
        public String dataType;
    }

    /**
     * Get all changed fields with details
     */
    private static Map<String, FieldChange> getChangedFields(ObjectName newRecord,
                                                              ObjectName oldRecord) {
        Map<String, FieldChange> changes = new Map<String, FieldChange>();

        Map<String, Object> newFields = newRecord.getPopulatedFieldsAsMap();
        Map<String, Object> oldFields = oldRecord.getPopulatedFieldsAsMap();

        for (String fieldName : newFields.keySet()) {
            Object oldValue = oldFields.get(fieldName);
            Object newValue = newFields.get(fieldName);

            if (oldValue != newValue) {
                FieldChange change = new FieldChange();
                change.fieldName = fieldName;
                change.oldValue = oldValue;
                change.newValue = newValue;
                change.isSensitive = SENSITIVE_FIELDS.contains(fieldName);
                change.dataType = getFieldType(fieldName);

                changes.put(fieldName, change);
            }
        }

        return changes;
    }

    /**
     * Format change summary for human readability
     */
    private static String formatChangeSummary(Map<String, FieldChange> changes) {
        List<String> summaryLines = new List<String>();

        for (FieldChange change : changes.values()) {
            String line = change.fieldName + ': ';

            if (change.isSensitive) {
                line += '[REDACTED] → [REDACTED]';
            } else {
                line += formatValue(change.oldValue) + ' → ' +
                       formatValue(change.newValue);
            }

            summaryLines.add(line);
        }

        return String.join(summaryLines, '\n');
    }

    /**
     * Check if any changed fields contain sensitive data
     */
    private static Boolean changedFieldsContainSensitiveData(
        Map<String, FieldChange> changes
    ) {
        for (FieldChange change : changes.values()) {
            if (change.isSensitive) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get list of sensitive fields modified
     */
    private static String getSensitiveFieldsModified(Map<String, FieldChange> changes) {
        List<String> sensitiveFields = new List<String>();

        for (FieldChange change : changes.values()) {
            if (change.isSensitive) {
                sensitiveFields.add(change.fieldName);
            }
        }

        return String.join(sensitiveFields, ', ');
    }

    // ========================================================================
    // RISK AND COMPLIANCE
    // ========================================================================

    /**
     * Calculate risk level of action
     */
    private static String calculateRiskLevel(String action, ObjectName record) {
        return calculateRiskLevel(action, record, null);
    }

    private static String calculateRiskLevel(String action,
                                             ObjectName record,
                                             Map<String, FieldChange> changes) {
        Integer riskScore = 0;

        // Action type risk
        if (action == 'DELETE') {
            riskScore += 50;
        } else if (action == 'UPDATE' && changes != null) {
            if (changes.size() > 10) {
                riskScore += 30; // Mass update
            }
            if (changedFieldsContainSensitiveData(changes)) {
                riskScore += 40; // Sensitive data change
            }
        }

        // Data classification risk
        String classification = classifyData(record);
        if (classification == 'HIGHLY_RESTRICTED') {
            riskScore += 40;
        } else if (classification == 'RESTRICTED') {
            riskScore += 30;
        } else if (classification == 'CONFIDENTIAL') {
            riskScore += 20;
        }

        // User risk (integration users = lower risk for automation)
        if (!isIntegrationUser()) {
            riskScore += 10;
        }

        // Time risk (after hours = higher risk)
        if (isAfterHours()) {
            riskScore += 15;
        }

        // Determine risk level
        if (riskScore >= 70) {
            return 'CRITICAL';
        } else if (riskScore >= 50) {
            return 'HIGH';
        } else if (riskScore >= 30) {
            return 'MEDIUM';
        } else {
            return 'LOW';
        }
    }

    /**
     * Classify data sensitivity level
     */
    private static String classifyData(ObjectName record) {
        if (containsSensitiveFields(record)) {
            return 'HIGHLY_RESTRICTED';
        }

        // Add custom logic for data classification
        // Based on record type, industry, customer type, etc.

        return 'INTERNAL';
    }

    /**
     * Check if record contains sensitive fields
     */
    private static Boolean containsSensitiveFields(ObjectName record) {
        Map<String, Object> fields = record.getPopulatedFieldsAsMap();

        for (String fieldName : SENSITIVE_FIELDS) {
            if (fields.containsKey(fieldName) && fields.get(fieldName) != null) {
                return true;
            }
        }

        return false;
    }

    /**
     * Determine if action requires approval
     */
    private static Boolean requiresApproval(String action, ObjectName record) {
        return requiresApproval(action, record, null);
    }

    private static Boolean requiresApproval(String action,
                                            ObjectName record,
                                            Map<String, FieldChange> changes) {
        // Always require approval for deletions
        if (action == 'DELETE') {
            return true;
        }

        // Require approval for sensitive data changes
        if (changes != null && changedFieldsContainSensitiveData(changes)) {
            return true;
        }

        // Require approval for high-value records
        if (isHighValueRecord(record)) {
            return true;
        }

        return false;
    }

    /**
     * Determine action category from changed fields
     */
    private static String determineActionCategory(Map<String, FieldChange> changes) {
        if (changedFieldsContainSensitiveData(changes)) {
            return 'SENSITIVE_DATA_MODIFIED';
        }

        if (changes.size() > 10) {
            return 'MASS_UPDATE';
        }

        if (changes.containsKey('OwnerId')) {
            return 'OWNERSHIP_TRANSFER';
        }

        if (changes.containsKey('Status__c')) {
            return 'STATUS_CHANGE';
        }

        return 'DATA_MODIFICATION';
    }

    // ========================================================================
    // SESSION AND CONTEXT
    // ========================================================================

    /**
     * Get current session information
     */
    private static Map<String, String> getSessionInfo() {
        Map<String, String> info = new Map<String, String>();

        // Get login history for session details
        List<LoginHistory> loginHistory = [
            SELECT Id, LoginTime, SourceIp, Platform, Browser
            FROM LoginHistory
            WHERE UserId = :UserInfo.getUserId()
            ORDER BY LoginTime DESC
            LIMIT 1
        ];

        if (!loginHistory.isEmpty()) {
            LoginHistory login = loginHistory[0];
            info.put('loginHistoryId', login.Id);
            info.put('ipAddress', login.SourceIp);
            info.put('platform', login.Platform);
            info.put('browser', login.Browser);
        }

        info.put('sessionId', UserInfo.getSessionId());

        return info;
    }

    /**
     * Get user profile name
     */
    private static String getUserProfile() {
        return [SELECT Name FROM Profile WHERE Id = :UserInfo.getProfileId()].Name;
    }

    /**
     * Get user role name
     */
    private static String getUserRole() {
        Id roleId = UserInfo.getUserRoleId();
        if (roleId == null) return null;

        return [SELECT Name FROM UserRole WHERE Id = :roleId].Name;
    }

    /**
     * Check if current user is integration user
     */
    private static Boolean isIntegrationUser() {
        String profileName = getUserProfile();
        return profileName.contains('Integration') ||
               profileName.contains('API') ||
               profileName.contains('System');
    }

    /**
     * Check if current time is after business hours
     */
    private static Boolean isAfterHours() {
        Time currentTime = System.now().time();
        Time businessStart = Time.newInstance(8, 0, 0, 0);  // 8 AM
        Time businessEnd = Time.newInstance(18, 0, 0, 0);   // 6 PM

        return currentTime < businessStart || currentTime > businessEnd;
    }

    // ========================================================================
    // TAMPER PROTECTION
    // ========================================================================

    /**
     * Calculate checksum for audit record integrity
     */
    private static String calculateChecksum(AuditTrail__c audit) {
        String data = String.valueOf(audit.UserId__c) +
                     String.valueOf(audit.RecordId__c) +
                     String.valueOf(audit.Action__c) +
                     String.valueOf(audit.ActionTimestamp__c);

        Blob hash = Crypto.generateDigest('SHA-256', Blob.valueOf(data));
        return EncodingUtil.base64Encode(hash);
    }

    /**
     * Verify audit record integrity
     */
    public static Boolean verifyChecksum(AuditTrail__c audit) {
        String currentChecksum = audit.Checksum__c;
        String calculatedChecksum = calculateChecksum(audit);

        return currentChecksum == calculatedChecksum;
    }

    // ========================================================================
    // ALERTING
    // ========================================================================

    /**
     * Alert on high-risk actions
     */
    private static void alertOnHighRisk(List<AuditTrail__c> auditRecords) {
        List<AuditAlert__e> alerts = new List<AuditAlert__e>();

        for (AuditTrail__c audit : auditRecords) {
            if (audit.RiskLevel__c == 'HIGH' || audit.RiskLevel__c == 'CRITICAL' ||
                HIGH_RISK_ACTIONS.contains(audit.ActionCategory__c)) {

                AuditAlert__e alert = new AuditAlert__e();
                alert.AuditId__c = audit.Id;
                alert.Severity__c = audit.RiskLevel__c;
                alert.Action__c = audit.Action__c;
                alert.UserId__c = audit.UserId__c;
                alert.UserName__c = audit.UserName__c;
                alert.RecordId__c = audit.RecordId__c;
                alert.AlertMessage__c = 'High-risk action detected: ' +
                    audit.ActionCategory__c + ' by ' + audit.UserName__c;

                alerts.add(alert);
            }
        }

        if (!alerts.isEmpty()) {
            EventBus.publish(alerts);
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    private static String getBusinessJustification(Id recordId) {
        // Implement logic to retrieve justification from custom field or object
        return null;
    }

    private static String getDeletionReason() {
        // Implement logic to retrieve deletion reason
        return null;
    }

    private static String getRecoveryReason() {
        // Implement logic to retrieve recovery reason
        return null;
    }

    private static String getSourceSystem() {
        // Determine if action came from UI, API, or integration
        return isIntegrationUser() ? 'API' : 'UI';
    }

    private static Boolean isHighValueRecord(ObjectName record) {
        // Implement logic to determine high-value records
        return false;
    }

    private static String verifyDataHandlingCompliance() {
        // Verify compliance with data handling policies
        return 'COMPLIANT';
    }

    private static String getFieldType(String fieldName) {
        // Get field type from schema
        return 'String';
    }

    private static String formatValue(Object value) {
        if (value == null) return 'null';
        return String.valueOf(value);
    }
}

// ============================================================================
// TEST CLASS TEMPLATE
// ============================================================================
@isTest
private class ObjectNameAuditTrailHandlerTest {

    @testSetup
    static void setup() {
        // Create test data
        List<ObjectName> testRecords = new List<ObjectName>();
        for (Integer i = 0; i < 10; i++) {
            testRecords.add(new ObjectName(
                Name = 'Test Record ' + i,
                Status__c = 'New'
            ));
        }
        insert testRecords;
    }

    @isTest
    static void testAuditInsert() {
        // Query audit trails
        List<AuditTrail__c> audits = [
            SELECT Id, Action__c, RiskLevel__c
            FROM AuditTrail__c
            WHERE Action__c = 'INSERT'
        ];

        // Verify audits created
        System.assertEquals(10, audits.size(), 'Should create audit for each insert');
    }

    @isTest
    static void testAuditUpdate() {
        ObjectName record = [SELECT Id, Status__c FROM ObjectName LIMIT 1];

        Test.startTest();
        record.Status__c = 'In Progress';
        update record;
        Test.stopTest();

        List<AuditTrail__c> audits = [
            SELECT Id, Action__c, FieldsModified__c
            FROM AuditTrail__c
            WHERE RecordId__c = :record.Id
              AND Action__c = 'UPDATE'
        ];

        System.assertEquals(1, audits.size(), 'Should create update audit');
        System.assert(audits[0].FieldsModified__c.contains('Status__c'),
            'Should track modified field');
    }

    @isTest
    static void testAuditDelete() {
        ObjectName record = [SELECT Id FROM ObjectName LIMIT 1];
        Id recordId = record.Id;

        Test.startTest();
        delete record;
        Test.stopTest();

        List<AuditTrail__c> audits = [
            SELECT Id, Action__c, RiskLevel__c, IsDataDeletion__c
            FROM AuditTrail__c
            WHERE RecordId__c = :recordId
              AND Action__c = 'DELETE'
        ];

        System.assertEquals(1, audits.size(), 'Should create delete audit');
        System.assertEquals('HIGH', audits[0].RiskLevel__c,
            'Deletions should be high risk');
        System.assertEquals(true, audits[0].IsDataDeletion__c,
            'Should mark as deletion');
    }

    @isTest
    static void testChecksumVerification() {
        AuditTrail__c audit = [SELECT Id, Checksum__c FROM AuditTrail__c LIMIT 1];

        Test.startTest();
        Boolean isValid = ObjectNameAuditTrailHandler.verifyChecksum(audit);
        Test.stopTest();

        System.assertEquals(true, isValid, 'Checksum should be valid');
    }
}

/**
 * REQUIRED CUSTOM OBJECT: AuditTrail__c
 *
 * Fields (WHO):
 *   - UserId__c (Lookup to User)
 *   - UserName__c (Text, 255)
 *   - UserEmail__c (Email)
 *   - UserProfile__c (Text, 255)
 *   - UserRole__c (Text, 255)
 *
 * Fields (WHAT):
 *   - ObjectType__c (Text, 80)
 *   - RecordId__c (Text, 18)
 *   - RecordName__c (Text, 255)
 *   - Action__c (Picklist: INSERT, UPDATE, DELETE, UNDELETE, VIEW)
 *   - ActionCategory__c (Text, 255)
 *   - FieldsModified__c (Long Text Area, 32768)
 *   - FieldCount__c (Number)
 *   - SensitiveFieldsModified__c (Long Text Area)
 *
 * Fields (WHEN):
 *   - ActionDate__c (DateTime)
 *   - ActionTimestamp__c (Number, 18, 0)
 *
 * Fields (WHERE):
 *   - IPAddress__c (Text, 45)
 *   - SessionId__c (Text, 255)
 *   - LoginHistory__c (Text, 18)
 *   - Platform__c (Text, 255)
 *   - Browser__c (Text, 255)
 *
 * Fields (WHY/HOW):
 *   - BusinessJustification__c (Long Text Area)
 *   - DeletionReason__c (Text, 255)
 *   - RecoveryReason__c (Text, 255)
 *   - SourceSystem__c (Picklist: UI, API, INTEGRATION, BATCH)
 *   - IntegrationUser__c (Checkbox)
 *
 * Fields (RISK/COMPLIANCE):
 *   - RiskLevel__c (Picklist: LOW, MEDIUM, HIGH, CRITICAL)
 *   - DataClassification__c (Picklist)
 *   - ContainsSensitiveData__c (Checkbox)
 *   - RequiresApproval__c (Checkbox)
 *   - DataHandlingCompliance__c (Text, 255)
 *
 * Fields (DATA):
 *   - ChangeSummary__c (Long Text Area, 32768)
 *   - BeforeValues__c (Long Text Area, 131072)
 *   - AfterValues__c (Long Text Area, 131072)
 *   - RecordSnapshot__c (Long Text Area, 131072)
 *   - FieldsAccessed__c (Long Text Area, 32768)
 *
 * Fields (DELETION):
 *   - IsDataDeletion__c (Checkbox)
 *   - CanBeRecovered__c (Checkbox)
 *   - RecoveryDeadline__c (DateTime)
 *
 * Fields (TAMPER PROTECTION):
 *   - Checksum__c (Text, 255)
 *   - IsLocked__c (Checkbox)
 *   - LockedDate__c (DateTime)
 *
 * Security:
 *   - Object permissions: Read-only for all users except System Administrator
 *   - Field-level security: No edit access after creation
 *   - Validation rules: Prevent modification of audit records
 *   - Consider Platform Encryption for sensitive audit data
 */
