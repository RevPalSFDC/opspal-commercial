/**
 * @description Validate field values against business rules
 * @usage Enforce field constraints beyond validation rules
 * @complexity Simple
 * @bestPractices Handler pattern, before trigger, custom error messages
 *
 * USE CASE EXAMPLES:
 * - Complex field validation (conditional requirements)
 * - Cross-field validation (EndDate > StartDate)
 * - Range validation (0 < Discount < 100)
 * - Format validation (email, phone, URL patterns)
 * - Business rule validation (cannot have Amount and Discount both null)
 * - Record type specific validation
 *
 * WHY USE TRIGGER INSTEAD OF VALIDATION RULE:
 * - Complex logic with multiple conditions
 * - Need to query related records
 * - Dynamic validation based on user permissions
 * - Custom error messages based on context
 * - Validation logic shared across multiple objects
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your object (e.g., Account, Opportunity)
 * [ ] Update handler class name (ObjectNameTriggerHandler)
 * [ ] Implement your validation rules
 * [ ] Add custom error messages
 * [ ] Test with various invalid scenarios
 * [ ] Deploy to sandbox and test before production
 */

trigger ObjectNameTrigger on ObjectName (before insert, before update) {
    ObjectNameTriggerHandler.handleBeforeInsertUpdate(Trigger.new, Trigger.oldMap);
}

/**
 * HANDLER CLASS TEMPLATE
 *
 * IMPLEMENTATION NOTES:
 * - Use before trigger (can add errors directly to records)
 * - Call addError() on field or record
 * - Provide clear, user-friendly error messages
 * - Group related validations together
 * - Keep validation logic separate from other logic
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
    public static void handleBeforeInsertUpdate(List<ObjectName> newRecords, Map<Id, ObjectName> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        Boolean isInsert = (oldMap == null);
        Boolean isUpdate = (oldMap != null);

        // Call validation methods
        validateRequiredFields(newRecords);
        validateFieldRanges(newRecords);
        validateCrossFieldLogic(newRecords);
        validateFieldFormats(newRecords);
        validateBusinessRules(newRecords, isInsert, isUpdate);
        validateRecordTypeSpecific(newRecords);

        isExecuting = false;
    }

    // ========================================
    // REQUIRED FIELD VALIDATION
    // ========================================

    private static void validateRequiredFields(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Simple required field validation
            if (record.ImportantField__c == null || record.ImportantField__c == '') {
                record.ImportantField__c.addError('ImportantField__c is required');
            }

            // Conditional required field (based on other field)
            if (record.Type__c == 'Enterprise') {
                if (record.AnnualRevenue__c == null) {
                    record.AnnualRevenue__c.addError(
                        'Annual Revenue is required for Enterprise accounts'
                    );
                }
                if (record.Employees == null) {
                    record.Employees.addError(
                        'Number of Employees is required for Enterprise accounts'
                    );
                }
            }

            // Required if another field is populated
            if (record.HasCustomPricing__c) {
                if (record.PricingJustification__c == null || record.PricingJustification__c == '') {
                    record.PricingJustification__c.addError(
                        'Pricing Justification is required when Custom Pricing is enabled'
                    );
                }
            }
        }
    }

    // ========================================
    // FIELD RANGE VALIDATION
    // ========================================

    private static void validateFieldRanges(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Numeric range validation
            if (record.Discount__c != null) {
                if (record.Discount__c < 0 || record.Discount__c > 100) {
                    record.Discount__c.addError('Discount must be between 0% and 100%');
                }
            }

            // Date range validation
            if (record.PromotionStartDate__c != null && record.PromotionEndDate__c != null) {
                if (record.PromotionStartDate__c > record.PromotionEndDate__c) {
                    record.PromotionEndDate__c.addError(
                        'Promotion End Date must be after Start Date'
                    );
                }
            }

            // Minimum threshold validation
            if (record.Amount__c != null && record.Amount__c < 100) {
                record.Amount__c.addError('Amount must be at least $100');
            }

            // Maximum threshold validation
            if (record.Quantity__c != null && record.Quantity__c > 1000) {
                record.Quantity__c.addError('Quantity cannot exceed 1,000 units');
            }
        }
    }

    // ========================================
    // CROSS-FIELD VALIDATION
    // ========================================

    private static void validateCrossFieldLogic(List<ObjectName> records) {
        for (ObjectName record : records) {
            // At least one of two fields required
            if (record.Email__c == null && record.Phone__c == null) {
                record.addError('Either Email or Phone is required');
            }

            // Mutually exclusive fields
            if (record.AutoRenew__c && record.ManualRenewal__c) {
                record.addError('Cannot have both Auto Renew and Manual Renewal enabled');
            }

            // Dependent fields (if A is set, B must be set)
            if (record.BillingStreet != null && record.BillingCountry == null) {
                record.BillingCountry.addError(
                    'Billing Country is required when Billing Street is provided'
                );
            }

            // Calculation validation
            if (record.TotalAmount__c != null &&
                record.Subtotal__c != null &&
                record.Tax__c != null) {
                Decimal expectedTotal = record.Subtotal__c + record.Tax__c;
                if (record.TotalAmount__c != expectedTotal) {
                    record.TotalAmount__c.addError(
                        'Total Amount must equal Subtotal + Tax (' + expectedTotal + ')'
                    );
                }
            }

            // Percentage sum validation
            if (record.DownPaymentPercent__c != null &&
                record.FinancingPercent__c != null) {
                Decimal total = record.DownPaymentPercent__c + record.FinancingPercent__c;
                if (total != 100) {
                    record.addError('Down Payment % + Financing % must equal 100%');
                }
            }
        }
    }

    // ========================================
    // FIELD FORMAT VALIDATION
    // ========================================

    private static void validateFieldFormats(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Email format validation (beyond standard Email field)
            if (record.SecondaryEmail__c != null) {
                if (!isValidEmail(record.SecondaryEmail__c)) {
                    record.SecondaryEmail__c.addError('Invalid email format');
                }
            }

            // Phone format validation
            if (record.Phone__c != null) {
                if (!isValidPhone(record.Phone__c)) {
                    record.Phone__c.addError('Phone must be 10 digits (e.g., 555-555-5555)');
                }
            }

            // URL format validation
            if (record.WebsiteURL__c != null) {
                if (!isValidURL(record.WebsiteURL__c)) {
                    record.WebsiteURL__c.addError('Invalid URL format (must start with http:// or https://)');
                }
            }

            // Alphanumeric validation
            if (record.AccountNumber__c != null) {
                if (!isAlphanumeric(record.AccountNumber__c)) {
                    record.AccountNumber__c.addError('Account Number must contain only letters and numbers');
                }
            }

            // Custom pattern validation (e.g., specific code format)
            if (record.ProductCode__c != null) {
                if (!Pattern.matches('[A-Z]{3}-[0-9]{4}', record.ProductCode__c)) {
                    record.ProductCode__c.addError('Product Code must be in format ABC-1234');
                }
            }
        }
    }

    // ========================================
    // BUSINESS RULE VALIDATION
    // ========================================

    private static void validateBusinessRules(List<ObjectName> records, Boolean isInsert, Boolean isUpdate) {
        for (ObjectName record : records) {
            // Cannot set both Amount and Discount
            if (record.FixedAmount__c != null && record.PercentDiscount__c != null) {
                record.addError('Cannot specify both Fixed Amount and Percent Discount');
            }

            // Status progression rules
            if (isUpdate) {
                // Cannot skip statuses (must progress in order)
                String[] validStatuses = new String[]{'New', 'In Progress', 'Review', 'Approved', 'Completed'};
                // Implement status progression logic
            }

            // Expiration date rules
            if (record.ExpirationDate__c != null) {
                if (record.ExpirationDate__c <= Date.today()) {
                    record.ExpirationDate__c.addError('Expiration Date must be in the future');
                }
            }

            // User permission-based validation
            if (!hasApprovalPermission()) {
                if (record.Status__c == 'Approved') {
                    record.Status__c.addError('You do not have permission to approve records');
                }
            }

            // Business logic: cannot exceed budget
            if (record.Amount__c != null && record.Budget__c != null) {
                if (record.Amount__c > record.Budget__c) {
                    record.Amount__c.addError(
                        'Amount ($' + record.Amount__c + ') exceeds Budget ($' + record.Budget__c + ')'
                    );
                }
            }
        }
    }

    // ========================================
    // RECORD TYPE SPECIFIC VALIDATION
    // ========================================

    private static void validateRecordTypeSpecific(List<ObjectName> records) {
        // Get record type IDs
        Id customerRecordTypeId = Schema.SObjectType.ObjectName.getRecordTypeInfosByName()
            .get('Customer').getRecordTypeId();
        Id partnerRecordTypeId = Schema.SObjectType.ObjectName.getRecordTypeInfosByName()
            .get('Partner').getRecordTypeId();

        for (ObjectName record : records) {
            // Customer record type validations
            if (record.RecordTypeId == customerRecordTypeId) {
                if (record.CustomerNumber__c == null) {
                    record.CustomerNumber__c.addError(
                        'Customer Number is required for Customer records'
                    );
                }
            }

            // Partner record type validations
            if (record.RecordTypeId == partnerRecordTypeId) {
                if (record.PartnerTier__c == null) {
                    record.PartnerTier__c.addError(
                        'Partner Tier is required for Partner records'
                    );
                }
                if (record.CommissionRate__c == null) {
                    record.CommissionRate__c.addError(
                        'Commission Rate is required for Partner records'
                    );
                }
            }
        }
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    private static Boolean isValidEmail(String email) {
        // Simple email validation
        String emailRegex = '^[a-zA-Z0-9._|\\\\%#~`=?&/$^*!}{+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,4}$';
        Pattern emailPattern = Pattern.compile(emailRegex);
        Matcher emailMatcher = emailPattern.matcher(email);
        return emailMatcher.matches();
    }

    private static Boolean isValidPhone(String phone) {
        // Remove non-numeric characters
        String cleaned = phone.replaceAll('[^0-9]', '');
        return cleaned.length() == 10;
    }

    private static Boolean isValidURL(String url) {
        return url.startsWith('http://') || url.startsWith('https://');
    }

    private static Boolean isAlphanumeric(String value) {
        return value.isAlphanumeric();
    }

    private static Boolean hasApprovalPermission() {
        // Check if user has approval permission
        return FeatureManagement.checkPermission('Approve_Records');
    }
}
*/

/**
 * REAL-WORLD EXAMPLE: Opportunity Field Validation
 *
 * Scenario: Validate opportunity fields based on stage and type
 */
/*
trigger OpportunityTrigger on Opportunity (before insert, before update) {
    OpportunityValidationHandler.handleBeforeInsertUpdate(Trigger.new, Trigger.oldMap);
}

public class OpportunityValidationHandler {

    private static Boolean isExecuting = false;

    public static void handleBeforeInsertUpdate(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        Boolean isInsert = (oldMap == null);

        validateRequiredFields(newOpps);
        validateStageSpecificFields(newOpps);
        validateAmountAndDiscount(newOpps);
        validateDates(newOpps);
        validateTypeSpecificFields(newOpps);

        isExecuting = false;
    }

    private static void validateRequiredFields(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            // Basic required fields
            if (opp.CloseDate == null) {
                opp.CloseDate.addError('Close Date is required');
            }

            if (opp.StageName == null || opp.StageName == '') {
                opp.StageName.addError('Stage is required');
            }

            // Conditional required fields
            if (opp.Type == 'New Business') {
                if (opp.LeadSource == null) {
                    opp.LeadSource.addError('Lead Source is required for New Business opportunities');
                }
            }
        }
    }

    private static void validateStageSpecificFields(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            // Closed Won validations
            if (opp.StageName == 'Closed Won') {
                if (opp.Amount == null) {
                    opp.Amount.addError('Amount is required to close opportunity as won');
                }
                if (opp.NextStep == null || opp.NextStep == '') {
                    opp.NextStep.addError('Next Step is required to close opportunity');
                }
                if (opp.ContractSignedDate__c == null) {
                    opp.ContractSignedDate__c.addError('Contract Signed Date is required for Closed Won');
                }
            }

            // Closed Lost validations
            if (opp.StageName == 'Closed Lost') {
                if (opp.LostReason__c == null) {
                    opp.LostReason__c.addError('Lost Reason is required for Closed Lost opportunities');
                }
                if (opp.LostCompetitor__c == null) {
                    opp.LostCompetitor__c.addError('Competitor is required for Closed Lost opportunities');
                }
            }

            // Proposal stage validations
            if (opp.StageName == 'Proposal') {
                if (opp.ProposalSentDate__c == null) {
                    opp.ProposalSentDate__c.addError('Proposal Sent Date is required for Proposal stage');
                }
            }
        }
    }

    private static void validateAmountAndDiscount(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            // Amount validation
            if (opp.Amount != null && opp.Amount < 0) {
                opp.Amount.addError('Amount cannot be negative');
            }

            // Discount validation
            if (opp.Discount__c != null) {
                if (opp.Discount__c < 0 || opp.Discount__c > 50) {
                    opp.Discount__c.addError('Discount must be between 0% and 50%');
                }

                // Require approval for discounts > 20%
                if (opp.Discount__c > 20 && opp.DiscountApprovalDate__c == null) {
                    opp.DiscountApprovalDate__c.addError(
                        'Discounts greater than 20% require manager approval'
                    );
                }
            }

            // Cannot have both discount and special pricing
            if (opp.Discount__c != null && opp.HasSpecialPricing__c) {
                opp.addError('Cannot have both Discount and Special Pricing');
            }
        }
    }

    private static void validateDates(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            // Close Date must be in future
            if (opp.CloseDate < Date.today()) {
                opp.CloseDate.addError('Close Date must be in the future');
            }

            // Close Date cannot be more than 2 years out
            if (opp.CloseDate > Date.today().addYears(2)) {
                opp.CloseDate.addError('Close Date cannot be more than 2 years in the future');
            }

            // Start Date < End Date
            if (opp.StartDate__c != null && opp.EndDate__c != null) {
                if (opp.StartDate__c > opp.EndDate__c) {
                    opp.EndDate__c.addError('End Date must be after Start Date');
                }
            }
        }
    }

    private static void validateTypeSpecificFields(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            // Renewal validations
            if (opp.Type == 'Renewal') {
                if (opp.RenewalParentOppId__c == null) {
                    opp.RenewalParentOppId__c.addError('Parent Opportunity is required for Renewals');
                }
                if (opp.RenewalPeriod__c == null) {
                    opp.RenewalPeriod__c.addError('Renewal Period is required for Renewals');
                }
            }

            // Upsell validations
            if (opp.Type == 'Upsell') {
                if (opp.UpsellReason__c == null) {
                    opp.UpsellReason__c.addError('Upsell Reason is required for Upsells');
                }
            }

            // Enterprise validations
            if (opp.Type == 'New Business - Enterprise') {
                if (opp.Amount == null || opp.Amount < 100000) {
                    opp.Amount.addError('Enterprise opportunities require minimum $100,000 amount');
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
 * [ ] Test each validation rule individually
 * [ ] Test valid scenarios (should NOT throw errors)
 * [ ] Test invalid scenarios (SHOULD throw errors)
 * [ ] Test boundary conditions
 * [ ] Test conditional validations
 * [ ] Test record type specific validations
 * [ ] Verify error messages are clear
 */
/*
@isTest
private class ObjectNameTriggerHandlerTest {

    // ========================================
    // VALID RECORD TEST
    // ========================================

    @isTest
    static void testInsert_ValidRecord() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ImportantField__c = 'Valid Value',
            Type__c = 'Standard',
            Discount__c = 10,
            Email__c = 'test@example.com',
            Phone__c = '555-555-5555'
        );

        Test.startTest();
        insert record;  // Should succeed without errors
        Test.stopTest();

        ObjectName inserted = [SELECT Id FROM ObjectName WHERE Id = :record.Id];
        System.assertNotEquals(null, inserted.Id, 'Record should be inserted successfully');
    }

    // ========================================
    // REQUIRED FIELD VALIDATION TEST
    // ========================================

    @isTest
    static void testInsert_MissingRequiredField() {
        ObjectName record = new ObjectName(
            Name = 'Test Record'
            // Missing ImportantField__c (required)
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('required'),
                'Error message should mention required field');
        }
        Test.stopTest();
    }

    // ========================================
    // RANGE VALIDATION TEST
    // ========================================

    @isTest
    static void testInsert_InvalidDiscountRange() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ImportantField__c = 'Value',
            Discount__c = 150  // Invalid: > 100%
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('between 0% and 100%'),
                'Error message should mention valid range');
        }
        Test.stopTest();
    }

    // ========================================
    // CROSS-FIELD VALIDATION TEST
    // ========================================

    @isTest
    static void testInsert_InvalidDateRange() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ImportantField__c = 'Value',
            PromotionStartDate__c = Date.today().addDays(10),
            PromotionEndDate__c = Date.today()  // Invalid: before start date
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('after Start Date'),
                'Error message should mention date order');
        }
        Test.stopTest();
    }

    // ========================================
    // FORMAT VALIDATION TEST
    // ========================================

    @isTest
    static void testInsert_InvalidEmailFormat() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ImportantField__c = 'Value',
            SecondaryEmail__c = 'invalid-email'  // Invalid format
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Invalid email'),
                'Error message should mention invalid email');
        }
        Test.stopTest();
    }

    // ========================================
    // CONDITIONAL VALIDATION TEST
    // ========================================

    @isTest
    static void testInsert_ConditionalRequiredField() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            ImportantField__c = 'Value',
            Type__c = 'Enterprise'
            // Missing AnnualRevenue__c (required for Enterprise)
        );

        Test.startTest();
        try {
            insert record;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Annual Revenue is required'),
                'Error message should mention conditional requirement');
        }
        Test.stopTest();
    }

    // ========================================
    // BOUNDARY TEST
    // ========================================

    @isTest
    static void testInsert_BoundaryValues() {
        // Test minimum valid value
        ObjectName record1 = new ObjectName(
            Name = 'Test Record 1',
            ImportantField__c = 'Value',
            Discount__c = 0  // Minimum valid
        );

        // Test maximum valid value
        ObjectName record2 = new ObjectName(
            Name = 'Test Record 2',
            ImportantField__c = 'Value',
            Discount__c = 100  // Maximum valid
        );

        Test.startTest();
        insert new List<ObjectName>{record1, record2};
        Test.stopTest();

        List<ObjectName> inserted = [SELECT Id FROM ObjectName];
        System.assertEquals(2, inserted.size(), 'Both boundary value records should be inserted');
    }

    // ========================================
    // BULK VALIDATION TEST
    // ========================================

    @isTest
    static void testInsert_BulkValidation() {
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                ImportantField__c = 'Value',
                Discount__c = 10
            ));
        }

        Test.startTest();
        insert records;  // Should succeed for all 200
        Test.stopTest();

        List<ObjectName> inserted = [SELECT Id FROM ObjectName];
        System.assertEquals(200, inserted.size(), 'All 200 valid records should be inserted');
    }
}
*/
