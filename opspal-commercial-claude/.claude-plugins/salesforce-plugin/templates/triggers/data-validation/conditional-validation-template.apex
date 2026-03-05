/**
 * @description Validation rules that vary by record type or field values
 * @usage Different validation rules for different scenarios
 * @complexity Medium
 * @bestPractices Handler pattern, before trigger, record type handling, profile checks
 *
 * USE CASE EXAMPLES:
 * - Different required fields per record type
 * - Validation based on user role/profile
 * - Stage-specific validation (Opportunity stages)
 * - Type-specific validation (Account types)
 * - Region-specific validation
 * - Time-based validation (business hours, fiscal periods)
 *
 * WHY USE TRIGGER INSTEAD OF VALIDATION RULE:
 * - Complex conditional logic
 * - Multiple record types with different rules
 * - Profile/permission-based validation
 * - Dynamic validation based on org settings
 * - Time-based or date-based conditions
 * - Validation requiring SOQL queries
 *
 * PERFORMANCE CONSIDERATIONS:
 * - Cache record type IDs (static variables)
 * - Check cheapest conditions first
 * - Short-circuit evaluation (use &&, ||)
 * - Minimize permission/profile checks
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your object (e.g., Opportunity, Account)
 * [ ] Define record types and their validation rules
 * [ ] Implement conditional logic
 * [ ] Test with all record types
 * [ ] Test with different user profiles
 * [ ] Deploy to sandbox and test before production
 */

trigger ObjectNameTrigger on ObjectName (before insert, before update) {
    ObjectNameTriggerHandler.handleBeforeInsertUpdate(Trigger.new, Trigger.oldMap);
}

/**
 * HANDLER CLASS TEMPLATE
 *
 * IMPLEMENTATION NOTES:
 * - Cache record type IDs in static variables
 * - Group validation by condition (record type, profile, etc.)
 * - Check cheapest conditions first (field values before SOQL)
 * - Provide context-specific error messages
 * - Consider maintainability (avoid too many conditions)
 */
/*
public class ObjectNameTriggerHandler {

    // ========================================
    // RECURSION PREVENTION
    // ========================================
    private static Boolean isExecuting = false;

    // ========================================
    // CACHED RECORD TYPE IDS
    // ========================================
    private static Id customerRecordTypeId;
    private static Id partnerRecordTypeId;
    private static Id prospectRecordTypeId;

    static {
        // Cache record type IDs (queried once)
        Map<String, Schema.RecordTypeInfo> recordTypes =
            Schema.SObjectType.ObjectName.getRecordTypeInfosByName();

        customerRecordTypeId = recordTypes.get('Customer').getRecordTypeId();
        partnerRecordTypeId = recordTypes.get('Partner').getRecordTypeId();
        prospectRecordTypeId = recordTypes.get('Prospect').getRecordTypeId();
    }

    // ========================================
    // MAIN HANDLER
    // ========================================
    public static void handleBeforeInsertUpdate(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        Boolean isInsert = (oldMap == null);

        // Call validation methods
        validateByRecordType(newRecords);
        validateByType(newRecords);
        validateByStatus(newRecords);
        validateByUserProfile(newRecords);
        validateByDateRange(newRecords);

        isExecuting = false;
    }

    // ========================================
    // VALIDATION BY RECORD TYPE
    // ========================================

    private static void validateByRecordType(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Customer record type validations
            if (record.RecordTypeId == customerRecordTypeId) {
                validateCustomerRecord(record);
            }

            // Partner record type validations
            else if (record.RecordTypeId == partnerRecordTypeId) {
                validatePartnerRecord(record);
            }

            // Prospect record type validations
            else if (record.RecordTypeId == prospectRecordTypeId) {
                validateProspectRecord(record);
            }
        }
    }

    private static void validateCustomerRecord(ObjectName record) {
        // Customer-specific required fields
        if (record.CustomerNumber__c == null) {
            record.CustomerNumber__c.addError('Customer Number is required for Customer records');
        }

        if (record.ContractEndDate__c == null) {
            record.ContractEndDate__c.addError('Contract End Date is required for Customers');
        }

        // Customer-specific business rules
        if (record.AnnualRevenue__c == null || record.AnnualRevenue__c < 10000) {
            record.AnnualRevenue__c.addError('Customers must have annual revenue of at least $10,000');
        }

        // Customer-specific field constraints
        if (record.PaymentTerms__c == null) {
            record.PaymentTerms__c.addError('Payment Terms are required for Customers');
        } else if (!isValidCustomerPaymentTerm(record.PaymentTerms__c)) {
            record.PaymentTerms__c.addError('Invalid Payment Terms for Customer. Valid options: Net 30, Net 60, Net 90');
        }
    }

    private static void validatePartnerRecord(ObjectName record) {
        // Partner-specific required fields
        if (record.PartnerTier__c == null) {
            record.PartnerTier__c.addError('Partner Tier is required for Partner records');
        }

        if (record.CommissionRate__c == null) {
            record.CommissionRate__c.addError('Commission Rate is required for Partners');
        } else if (record.CommissionRate__c < 5 || record.CommissionRate__c > 30) {
            record.CommissionRate__c.addError('Commission Rate for Partners must be between 5% and 30%');
        }

        // Partner-specific business rules
        if (record.PartnerAgreementSigned__c != true) {
            record.PartnerAgreementSigned__c.addError('Partner Agreement must be signed before creating Partner record');
        }
    }

    private static void validateProspectRecord(ObjectName record) {
        // Prospect-specific required fields
        if (record.LeadSource__c == null) {
            record.LeadSource__c.addError('Lead Source is required for Prospect records');
        }

        if (record.LastContactDate__c == null) {
            record.LastContactDate__c.addError('Last Contact Date is required for Prospects');
        }

        // Prospect-specific business rules
        // Cannot have customer-only fields populated
        if (record.CustomerNumber__c != null) {
            record.CustomerNumber__c.addError('Prospects cannot have Customer Number. Convert to Customer first.');
        }

        if (record.ContractEndDate__c != null) {
            record.ContractEndDate__c.addError('Prospects cannot have Contract End Date. Convert to Customer first.');
        }
    }

    // ========================================
    // VALIDATION BY TYPE FIELD
    // ========================================

    private static void validateByType(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Enterprise type validations
            if (record.Type__c == 'Enterprise') {
                if (record.AnnualRevenue__c == null || record.AnnualRevenue__c < 1000000) {
                    record.AnnualRevenue__c.addError('Enterprise accounts require annual revenue of at least $1,000,000');
                }

                if (record.Employees == null || record.Employees < 500) {
                    record.Employees.addError('Enterprise accounts require at least 500 employees');
                }

                if (record.AccountExecutive__c == null) {
                    record.AccountExecutive__c.addError('Enterprise accounts require an Account Executive');
                }
            }

            // Small Business type validations
            else if (record.Type__c == 'Small Business') {
                if (record.AnnualRevenue__c != null && record.AnnualRevenue__c > 50000) {
                    record.AnnualRevenue__c.addError('Small Business accounts cannot have revenue over $50,000');
                }
            }

            // Government type validations
            else if (record.Type__c == 'Government') {
                if (record.GovernmentID__c == null) {
                    record.GovernmentID__c.addError('Government ID is required for Government accounts');
                }

                if (record.TaxExempt__c != true) {
                    record.TaxExempt__c.addError('Government accounts must be marked Tax Exempt');
                }
            }
        }
    }

    // ========================================
    // VALIDATION BY STATUS
    // ========================================

    private static void validateByStatus(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Active status validations
            if (record.Status__c == 'Active') {
                if (record.ActivationDate__c == null) {
                    record.ActivationDate__c.addError('Activation Date is required for Active records');
                }

                if (record.PrimaryContact__c == null) {
                    record.PrimaryContact__c.addError('Primary Contact is required for Active records');
                }
            }

            // Inactive status validations
            else if (record.Status__c == 'Inactive') {
                if (record.InactivationReason__c == null) {
                    record.InactivationReason__c.addError('Inactivation Reason is required for Inactive records');
                }

                if (record.InactivationDate__c == null) {
                    record.InactivationDate__c.addError('Inactivation Date is required for Inactive records');
                }
            }

            // Pending status validations
            else if (record.Status__c == 'Pending Approval') {
                if (record.SubmittedForApproval__c != true) {
                    record.addError('Record must be submitted for approval before setting status to Pending Approval');
                }

                if (record.Approver__c == null) {
                    record.Approver__c.addError('Approver is required for Pending Approval status');
                }
            }
        }
    }

    // ========================================
    // VALIDATION BY USER PROFILE
    // ========================================

    private static void validateByUserProfile(List<ObjectName> records) {
        // Get current user's profile
        Boolean isSystemAdmin = isSystemAdministrator();
        Boolean hasSalesManager = hasSalesManagerProfile();

        for (ObjectName record : records) {
            // Only System Admins can set certain fields
            if (record.SystemControlledField__c != null && !isSystemAdmin) {
                record.SystemControlledField__c.addError(
                    'Only System Administrators can modify System Controlled Field'
                );
            }

            // Only Sales Managers can approve discounts > 20%
            if (record.Discount__c != null && record.Discount__c > 20) {
                if (record.DiscountApproved__c == true && !hasSalesManager && !isSystemAdmin) {
                    record.DiscountApproved__c.addError(
                        'Only Sales Managers can approve discounts greater than 20%'
                    );
                }
            }

            // Restrict record deletion to specific profiles
            if (record.IsDeleted && !isSystemAdmin) {
                record.addError('Only System Administrators can delete this type of record');
            }
        }
    }

    // ========================================
    // VALIDATION BY DATE RANGE / TIME
    // ========================================

    private static void validateByDateRange(List<ObjectName> records) {
        // Get current date/time context
        Date today = Date.today();
        DateTime now = System.now();
        Boolean isBusinessHours = isWithinBusinessHours(now);
        String currentFiscalPeriod = getCurrentFiscalPeriod(today);

        for (ObjectName record : records) {
            // Date range validations
            if (record.EffectiveDate__c != null && record.ExpirationDate__c != null) {
                // Effective date must be before expiration date
                if (record.EffectiveDate__c >= record.ExpirationDate__c) {
                    record.ExpirationDate__c.addError('Expiration Date must be after Effective Date');
                }

                // Cannot expire in the past
                if (record.ExpirationDate__c < today) {
                    record.ExpirationDate__c.addError('Expiration Date cannot be in the past');
                }

                // Minimum duration (30 days)
                if (record.EffectiveDate__c.daysBetween(record.ExpirationDate__c) < 30) {
                    record.ExpirationDate__c.addError('Minimum duration is 30 days');
                }
            }

            // Business hours validation
            if (record.RequiresBusinessHoursProcessing__c && !isBusinessHours) {
                record.addError('This record can only be created or modified during business hours (9 AM - 5 PM EST)');
            }

            // Fiscal period validation
            if (record.FiscalPeriod__c != null && record.FiscalPeriod__c != currentFiscalPeriod) {
                record.FiscalPeriod__c.addError(
                    'Fiscal Period must be current period (' + currentFiscalPeriod + ')'
                );
            }

            // Quarter-end restrictions
            if (isQuarterEnd(today) && record.Type__c == 'Revenue Adjustment') {
                record.addError('Revenue Adjustments cannot be created in the last week of the quarter');
            }
        }
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    private static Boolean isValidCustomerPaymentTerm(String paymentTerm) {
        Set<String> validTerms = new Set<String>{'Net 30', 'Net 60', 'Net 90'};
        return validTerms.contains(paymentTerm);
    }

    private static Boolean isSystemAdministrator() {
        return [SELECT Id FROM Profile WHERE Id = :UserInfo.getProfileId() AND Name = 'System Administrator'].size() > 0;
    }

    private static Boolean hasSalesManagerProfile() {
        return [SELECT Id FROM Profile WHERE Id = :UserInfo.getProfileId() AND Name LIKE '%Sales Manager%'].size() > 0;
    }

    private static Boolean isWithinBusinessHours(DateTime dt) {
        Time businessStart = Time.newInstance(9, 0, 0, 0);  // 9 AM
        Time businessEnd = Time.newInstance(17, 0, 0, 0);   // 5 PM
        Time currentTime = dt.time();

        return currentTime >= businessStart && currentTime <= businessEnd;
    }

    private static String getCurrentFiscalPeriod(Date dt) {
        // Simple fiscal period calculation (customize based on your org's fiscal year)
        Integer month = dt.month();
        Integer year = dt.year();

        if (month >= 1 && month <= 3) {
            return 'Q1 ' + year;
        } else if (month >= 4 && month <= 6) {
            return 'Q2 ' + year;
        } else if (month >= 7 && month <= 9) {
            return 'Q3 ' + year;
        } else {
            return 'Q4 ' + year;
        }
    }

    private static Boolean isQuarterEnd(Date dt) {
        Integer month = dt.month();
        Integer dayOfMonth = dt.day();
        Integer daysInMonth = Date.daysInMonth(dt.year(), month);

        // Quarter ends: March 31, June 30, Sept 30, Dec 31
        Boolean isQuarterEndMonth = (month == 3 || month == 6 || month == 9 || month == 12);

        // Last 7 days of quarter-end month
        return isQuarterEndMonth && (dayOfMonth > daysInMonth - 7);
    }
}
*/

/**
 * REAL-WORLD EXAMPLE: Opportunity Stage-Specific Validation
 *
 * Scenario: Different required fields for each Opportunity stage
 */
/*
trigger OpportunityTrigger on Opportunity (before insert, before update) {
    OpportunityConditionalValidationHandler.handleBeforeInsertUpdate(Trigger.new, Trigger.oldMap);
}

public class OpportunityConditionalValidationHandler {

    private static Boolean isExecuting = false;

    public static void handleBeforeInsertUpdate(List<Opportunity> newOpps,
                                                 Map<Id, Opportunity> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        validateByStage(newOpps);
        validateByType(newOpps);
        validateByUserRole(newOpps);

        isExecuting = false;
    }

    private static void validateByStage(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            // Prospecting stage
            if (opp.StageName == 'Prospecting') {
                if (opp.LeadSource == null) {
                    opp.LeadSource.addError('Lead Source is required in Prospecting stage');
                }
            }

            // Qualification stage
            else if (opp.StageName == 'Qualification') {
                if (opp.LeadSource == null) {
                    opp.LeadSource.addError('Lead Source is required in Qualification stage');
                }
                if (opp.Budget__c == null) {
                    opp.Budget__c.addError('Budget is required in Qualification stage');
                }
            }

            // Needs Analysis stage
            else if (opp.StageName == 'Needs Analysis') {
                if (opp.Budget__c == null) {
                    opp.Budget__c.addError('Budget is required in Needs Analysis stage');
                }
                if (opp.DecisionMaker__c == null) {
                    opp.DecisionMaker__c.addError('Decision Maker is required in Needs Analysis stage');
                }
                if (opp.CompetitorAnalysis__c == null) {
                    opp.CompetitorAnalysis__c.addError('Competitor Analysis is required in Needs Analysis stage');
                }
            }

            // Proposal stage
            else if (opp.StageName == 'Proposal') {
                if (opp.Amount == null) {
                    opp.Amount.addError('Amount is required in Proposal stage');
                }
                if (opp.ProposalSentDate__c == null) {
                    opp.ProposalSentDate__c.addError('Proposal Sent Date is required in Proposal stage');
                }
                if (opp.NextStep == null) {
                    opp.NextStep.addError('Next Step is required in Proposal stage');
                }
            }

            // Negotiation stage
            else if (opp.StageName == 'Negotiation') {
                if (opp.Amount == null) {
                    opp.Amount.addError('Amount is required in Negotiation stage');
                }
                if (opp.ProposalSentDate__c == null) {
                    opp.ProposalSentDate__c.addError('Proposal Sent Date is required in Negotiation stage');
                }
                if (opp.LegalReviewDate__c == null) {
                    opp.LegalReviewDate__c.addError('Legal Review Date is required in Negotiation stage');
                }
            }

            // Closed Won stage
            else if (opp.StageName == 'Closed Won') {
                if (opp.Amount == null) {
                    opp.Amount.addError('Amount is required to close opportunity');
                }
                if (opp.ContractSignedDate__c == null) {
                    opp.ContractSignedDate__c.addError('Contract Signed Date is required for Closed Won');
                }
                if (opp.NextStep == null) {
                    opp.NextStep.addError('Next Step (implementation plan) is required for Closed Won');
                }
            }

            // Closed Lost stage
            else if (opp.StageName == 'Closed Lost') {
                if (opp.LostReason__c == null) {
                    opp.LostReason__c.addError('Lost Reason is required for Closed Lost opportunities');
                }
                if (opp.LostCompetitor__c == null) {
                    opp.LostCompetitor__c.addError('Competitor is required for Closed Lost opportunities');
                }
            }
        }
    }

    private static void validateByType(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            // New Business validations
            if (opp.Type == 'New Business') {
                if (opp.LeadSource == null) {
                    opp.LeadSource.addError('Lead Source is required for New Business opportunities');
                }
            }

            // Renewal validations
            else if (opp.Type == 'Renewal') {
                if (opp.RenewalOf__c == null) {
                    opp.RenewalOf__c.addError('Renewal Of (parent opportunity) is required for Renewals');
                }
                if (opp.RenewalDate__c == null) {
                    opp.RenewalDate__c.addError('Renewal Date is required for Renewals');
                }
            }

            // Upsell validations
            else if (opp.Type == 'Upsell') {
                if (opp.ExistingCustomer__c != true) {
                    opp.ExistingCustomer__c.addError('Upsells must be for existing customers');
                }
                if (opp.UpsellReason__c == null) {
                    opp.UpsellReason__c.addError('Upsell Reason is required for Upsells');
                }
            }
        }
    }

    private static void validateByUserRole(List<Opportunity> opps) {
        Boolean isSalesManager = [
            SELECT Id
            FROM UserRole
            WHERE Id = :UserInfo.getUserRoleId()
              AND Name LIKE '%Sales Manager%'
        ].size() > 0;

        for (Opportunity opp : opps) {
            // Only Sales Managers can create Enterprise opportunities
            if (opp.Type == 'New Business - Enterprise' && !isSalesManager) {
                opp.Type.addError('Only Sales Managers can create Enterprise opportunities');
            }

            // Only Sales Managers can approve discounts > 15%
            if (opp.Discount__c != null && opp.Discount__c > 15) {
                if (opp.DiscountApproved__c == true && !isSalesManager) {
                    opp.DiscountApproved__c.addError(
                        'Only Sales Managers can approve discounts greater than 15%'
                    );
                }
            }
        }
    }
}
*/

/**
 * TEST CLASS TEMPLATE
 *
 * TESTING CHECKLIST:
 * [ ] Test each condition path (record type, type, status, profile)
 * [ ] Test with different record types
 * [ ] Test with different user profiles (run as)
 * [ ] Test date/time-based validations
 * [ ] Test business hours restrictions
 * [ ] Test fiscal period validations
 * [ ] Verify condition short-circuiting works
 * [ ] Verify error messages are context-specific
 */
/*
@isTest
private class ObjectNameTriggerHandlerTest {

    // ========================================
    // RECORD TYPE VALIDATION TESTS
    // ========================================

    @isTest
    static void testInsert_CustomerRecordType() {
        Id customerRecordType = Schema.SObjectType.ObjectName.getRecordTypeInfosByName()
            .get('Customer').getRecordTypeId();

        ObjectName record = new ObjectName(
            Name = 'Test Customer',
            RecordTypeId = customerRecordType
            // Missing CustomerNumber__c (required for Customer)
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Customer Number'),
                'Error should mention Customer Number is required');
        }
        Test.stopTest();
    }

    @isTest
    static void testInsert_PartnerRecordType() {
        Id partnerRecordType = Schema.SObjectType.ObjectName.getRecordTypeInfosByName()
            .get('Partner').getRecordTypeId();

        ObjectName record = new ObjectName(
            Name = 'Test Partner',
            RecordTypeId = partnerRecordType
            // Missing PartnerTier__c (required for Partner)
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Partner Tier'),
                'Error should mention Partner Tier is required');
        }
        Test.stopTest();
    }

    // ========================================
    // TYPE-BASED VALIDATION TESTS
    // ========================================

    @isTest
    static void testInsert_EnterpriseType() {
        ObjectName record = new ObjectName(
            Name = 'Test Enterprise',
            Type__c = 'Enterprise',
            AnnualRevenue__c = 500000  // Less than 1M minimum
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('$1,000,000'),
                'Error should mention Enterprise minimum revenue');
        }
        Test.stopTest();
    }

    // ========================================
    // STATUS-BASED VALIDATION TESTS
    // ========================================

    @isTest
    static void testInsert_ActiveStatus() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Status__c = 'Active'
            // Missing ActivationDate__c (required for Active)
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Activation Date'),
                'Error should mention Activation Date is required');
        }
        Test.stopTest();
    }

    // ========================================
    // PROFILE-BASED VALIDATION TESTS
    // ========================================

    @isTest
    static void testInsert_SystemFieldAsNonAdmin() {
        // Create test user (non-admin)
        User testUser = createTestUser('Standard User');

        ObjectName record = new ObjectName(
            Name = 'Test Record',
            SystemControlledField__c = 'Value'  // Only admins can set
        );

        Test.startTest();
        System.runAs(testUser) {
            try {
                insert record;
                System.assert(false, 'Should have thrown validation error');
            } catch (DmlException e) {
                System.assert(e.getMessage().contains('System Administrators'),
                    'Error should mention only admins can modify this field');
            }
        }
        Test.stopTest();
    }

    // ========================================
    // DATE RANGE VALIDATION TESTS
    // ========================================

    @isTest
    static void testInsert_InvalidDateRange() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            EffectiveDate__c = Date.today().addDays(10),
            ExpirationDate__c = Date.today()  // Before effective date (invalid)
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('after Effective Date'),
                'Error should mention expiration must be after effective');
        }
        Test.stopTest();
    }

    @isTest
    static void testInsert_MinimumDuration() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            EffectiveDate__c = Date.today(),
            ExpirationDate__c = Date.today().addDays(15)  // Only 15 days (min 30)
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('30 days'),
                'Error should mention minimum duration');
        }
        Test.stopTest();
    }

    // ========================================
    // BULK VALIDATION TESTS
    // ========================================

    @isTest
    static void testInsert_BulkWithDifferentRecordTypes() {
        Id customerRT = Schema.SObjectType.ObjectName.getRecordTypeInfosByName()
            .get('Customer').getRecordTypeId();
        Id partnerRT = Schema.SObjectType.ObjectName.getRecordTypeInfosByName()
            .get('Partner').getRecordTypeId();

        List<ObjectName> records = new List<ObjectName>();

        // 100 valid customer records
        for (Integer i = 0; i < 100; i++) {
            records.add(new ObjectName(
                Name = 'Customer ' + i,
                RecordTypeId = customerRT,
                CustomerNumber__c = 'CUST-' + i,
                AnnualRevenue__c = 10000
            ));
        }

        // 100 valid partner records
        for (Integer i = 0; i < 100; i++) {
            records.add(new ObjectName(
                Name = 'Partner ' + i,
                RecordTypeId = partnerRT,
                PartnerTier__c = 'Gold',
                CommissionRate__c = 15
            ));
        }

        Test.startTest();
        insert records;
        Test.stopTest();

        List<ObjectName> inserted = [SELECT Id, RecordTypeId FROM ObjectName];
        System.assertEquals(200, inserted.size(), 'All 200 records should be inserted');
    }

    // ========================================
    // UTILITY METHOD FOR TESTS
    // ========================================

    private static User createTestUser(String profileName) {
        Profile p = [SELECT Id FROM Profile WHERE Name = :profileName LIMIT 1];

        User testUser = new User(
            Alias = 'tuser',
            Email = 'testuser@test.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Testing',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            UserName = 'testuser' + System.now().getTime() + '@test.com'
        );

        insert testUser;
        return testUser;
    }
}
*/
