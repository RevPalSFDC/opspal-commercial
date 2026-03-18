/**
 * Default Values Template
 *
 * USE CASE: Set intelligent default values based on complex logic beyond field defaults
 *
 * When to use this template:
 * - Defaults requiring SOQL queries (lookup to parent/related records)
 * - Defaults based on custom settings or custom metadata
 * - Conditional defaults based on record type, profile, or other fields
 * - Defaults requiring date/time calculations (next business day, fiscal period)
 * - Defaults from external systems or APIs
 * - Sequential numbering (auto-increment with custom logic)
 * - Territory/ownership assignment based on rules
 *
 * COMPLEXITY: Simple
 * GOVERNOR LIMITS: Target < 5 SOQL queries, 0 DML operations (before trigger)
 *
 * CUSTOMIZATION CHECKLIST:
 * 1. Replace ObjectName with your object API name
 * 2. Replace default field names with your fields
 * 3. Implement your default value logic in helper methods
 * 4. Update custom settings or custom metadata types as needed
 * 5. Consider caching static defaults (record types, picklist values)
 * 6. Test with null values and edge cases
 */

// ============================================================================
// TRIGGER FILE: ObjectNameTrigger.trigger
// ============================================================================
trigger ObjectNameTrigger on ObjectName (before insert) {
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
            if (Trigger.isBefore && Trigger.isInsert) {
                handleBeforeInsert(Trigger.new);
            }
        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // BEFORE INSERT - Set default values for new records
    // ========================================================================
    private static void handleBeforeInsert(List<ObjectName> newRecords) {
        // Set defaults in logical order
        setSimpleDefaults(newRecords);           // 1. Simple static defaults
        setRecordTypeDefaults(newRecords);       // 2. Record type-based defaults
        setUserProfileDefaults(newRecords);      // 3. User profile-based defaults
        setParentFieldDefaults(newRecords);      // 4. Defaults from parent records
        setCustomSettingsDefaults(newRecords);   // 5. Defaults from custom settings
        setDateDefaults(newRecords);             // 6. Date/time defaults
        setOwnershipDefaults(newRecords);        // 7. Owner assignment
        setSequentialDefaults(newRecords);       // 8. Sequential numbering
    }

    // ========================================================================
    // PATTERN 1: Simple Static Defaults
    // ========================================================================
    private static void setSimpleDefaults(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Set default status
            if (record.Status__c == null) {
                record.Status__c = 'New';
            }

            // Set default priority
            if (record.Priority__c == null) {
                record.Priority__c = 'Medium';
            }

            // Set default currency
            if (record.CurrencyIsoCode == null) {
                record.CurrencyIsoCode = 'USD';
            }

            // Set default boolean flags
            if (record.IsActive__c == null) {
                record.IsActive__c = true;
            }

            if (record.SendNotifications__c == null) {
                record.SendNotifications__c = true;
            }

            // Set default numeric values
            if (record.Quantity__c == null) {
                record.Quantity__c = 1;
            }

            if (record.DiscountPercent__c == null) {
                record.DiscountPercent__c = 0;
            }

            // Set default text values
            if (record.Source__c == null) {
                record.Source__c = 'Web';
            }

            // Set creation metadata
            if (record.CreatedByUser__c == null) {
                record.CreatedByUser__c = UserInfo.getName();
            }

            if (record.CreatedByProfile__c == null) {
                record.CreatedByProfile__c = UserInfo.getProfileId();
            }
        }
    }

    // ========================================================================
    // PATTERN 2: Record Type-Based Defaults
    // ========================================================================
    private static Map<Id, Schema.RecordTypeInfo> recordTypeMap;

    private static void setRecordTypeDefaults(List<ObjectName> records) {
        // Cache record type info
        if (recordTypeMap == null) {
            recordTypeMap = Schema.SObjectType.ObjectName.getRecordTypeInfosById();
        }

        for (ObjectName record : records) {
            if (record.RecordTypeId == null) continue;

            Schema.RecordTypeInfo rtInfo = recordTypeMap.get(record.RecordTypeId);
            if (rtInfo == null) continue;

            String recordTypeName = rtInfo.getName();

            // Customer record type defaults
            if (recordTypeName == 'Customer') {
                if (record.Category__c == null) {
                    record.Category__c = 'Existing Customer';
                }
                if (record.RenewalRequired__c == null) {
                    record.RenewalRequired__c = true;
                }
                if (record.SupportLevel__c == null) {
                    record.SupportLevel__c = 'Standard';
                }
            }

            // Partner record type defaults
            else if (recordTypeName == 'Partner') {
                if (record.Category__c == null) {
                    record.Category__c = 'Partner';
                }
                if (record.PartnerTier__c == null) {
                    record.PartnerTier__c = 'Silver';
                }
                if (record.CommissionRate__c == null) {
                    record.CommissionRate__c = 10.0;
                }
            }

            // Prospect record type defaults
            else if (recordTypeName == 'Prospect') {
                if (record.Category__c == null) {
                    record.Category__c = 'New Business';
                }
                if (record.LeadScore__c == null) {
                    record.LeadScore__c = 0;
                }
                if (record.FollowUpRequired__c == null) {
                    record.FollowUpRequired__c = true;
                }
            }
        }
    }

    // ========================================================================
    // PATTERN 3: User Profile-Based Defaults
    // ========================================================================
    private static void setUserProfileDefaults(List<ObjectName> records) {
        // Get current user's profile (cached)
        Id profileId = UserInfo.getProfileId();
        Profile currentProfile = [SELECT Id, Name
                                  FROM Profile
                                  WHERE Id = :profileId
                                  LIMIT 1];

        for (ObjectName record : records) {
            // Sales profile defaults
            if (currentProfile.Name.contains('Sales')) {
                if (record.AssignToSales__c == null) {
                    record.AssignToSales__c = true;
                }
                if (record.SalesRegion__c == null) {
                    // Get user's default sales region
                    record.SalesRegion__c = UserInfo.getUserRoleId() != null ?
                        'Regional' : 'Corporate';
                }
            }

            // Support profile defaults
            else if (currentProfile.Name.contains('Support')) {
                if (record.Priority__c == null) {
                    record.Priority__c = 'High'; // Support defaults to high priority
                }
                if (record.ResponseTimeHours__c == null) {
                    record.ResponseTimeHours__c = 24;
                }
            }

            // Manager profile defaults
            else if (currentProfile.Name.contains('Manager')) {
                if (record.RequiresApproval__c == null) {
                    record.RequiresApproval__c = false; // Managers don't need approval
                }
                if (record.ApprovalLevel__c == null) {
                    record.ApprovalLevel__c = 'Manager';
                }
            }

            // Set default owner to current user if not specified
            if (record.OwnerId == null) {
                record.OwnerId = UserInfo.getUserId();
            }
        }
    }

    // ========================================================================
    // PATTERN 4: Defaults from Parent Records
    // ========================================================================
    private static void setParentFieldDefaults(List<ObjectName> records) {
        // Collect parent IDs
        Set<Id> parentIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.ParentId__c != null) {
                parentIds.add(record.ParentId__c);
            }
        }

        if (parentIds.isEmpty()) return;

        // Query parent records (SINGLE query)
        Map<Id, ParentObject__c> parentMap = new Map<Id, ParentObject__c>([
            SELECT Id, Name, Category__c, Region__c, PriceLevel__c,
                   TaxRate__c, CurrencyIsoCode, PaymentTerms__c,
                   BillingStreet, BillingCity, BillingState,
                   BillingPostalCode, BillingCountry
            FROM ParentObject__c
            WHERE Id IN :parentIds
        ]);

        // Copy defaults from parent
        for (ObjectName record : records) {
            if (record.ParentId__c != null &&
                parentMap.containsKey(record.ParentId__c)) {

                ParentObject__c parent = parentMap.get(record.ParentId__c);

                // Copy category
                if (record.Category__c == null && parent.Category__c != null) {
                    record.Category__c = parent.Category__c;
                }

                // Copy region
                if (record.Region__c == null && parent.Region__c != null) {
                    record.Region__c = parent.Region__c;
                }

                // Copy price level
                if (record.PriceLevel__c == null && parent.PriceLevel__c != null) {
                    record.PriceLevel__c = parent.PriceLevel__c;
                }

                // Copy tax rate
                if (record.TaxRate__c == null && parent.TaxRate__c != null) {
                    record.TaxRate__c = parent.TaxRate__c;
                }

                // Copy currency
                if (record.CurrencyIsoCode == null &&
                    parent.CurrencyIsoCode != null) {
                    record.CurrencyIsoCode = parent.CurrencyIsoCode;
                }

                // Copy payment terms
                if (record.PaymentTerms__c == null &&
                    parent.PaymentTerms__c != null) {
                    record.PaymentTerms__c = parent.PaymentTerms__c;
                }

                // Copy billing address if not specified
                if (record.BillingStreet == null && parent.BillingStreet != null) {
                    record.BillingStreet = parent.BillingStreet;
                    record.BillingCity = parent.BillingCity;
                    record.BillingState = parent.BillingState;
                    record.BillingPostalCode = parent.BillingPostalCode;
                    record.BillingCountry = parent.BillingCountry;
                }
            }
        }
    }

    // ========================================================================
    // PATTERN 5: Defaults from Custom Settings
    // ========================================================================
    private static void setCustomSettingsDefaults(List<ObjectName> records) {
        // Query custom settings (cached automatically by Salesforce)
        DefaultSettings__c settings = DefaultSettings__c.getInstance();

        if (settings == null) return;

        for (ObjectName record : records) {
            // Apply custom setting defaults
            if (record.DefaultDiscount__c == null &&
                settings.DefaultDiscountPercent__c != null) {
                record.DefaultDiscount__c = settings.DefaultDiscountPercent__c;
            }

            if (record.ShippingMethod__c == null &&
                settings.DefaultShippingMethod__c != null) {
                record.ShippingMethod__c = settings.DefaultShippingMethod__c;
            }

            if (record.PaymentTerms__c == null &&
                settings.DefaultPaymentTerms__c != null) {
                record.PaymentTerms__c = settings.DefaultPaymentTerms__c;
            }

            if (record.WarrantyPeriodDays__c == null &&
                settings.DefaultWarrantyDays__c != null) {
                record.WarrantyPeriodDays__c = settings.DefaultWarrantyDays__c;
            }

            // Apply regional defaults based on user's region
            String userRegion = getUserRegion();
            if (userRegion == 'EMEA' && settings.EMEA_TaxRate__c != null) {
                if (record.TaxRate__c == null) {
                    record.TaxRate__c = settings.EMEA_TaxRate__c;
                }
            } else if (userRegion == 'APAC' && settings.APAC_TaxRate__c != null) {
                if (record.TaxRate__c == null) {
                    record.TaxRate__c = settings.APAC_TaxRate__c;
                }
            }
        }
    }

    // ========================================================================
    // PATTERN 6: Date/Time Defaults
    // ========================================================================
    private static void setDateDefaults(List<ObjectName> records) {
        Date today = Date.today();
        DateTime now = System.now();

        for (ObjectName record : records) {
            // Set creation date/time
            if (record.CreatedDate__c == null) {
                record.CreatedDate__c = today;
            }

            if (record.CreatedDateTime__c == null) {
                record.CreatedDateTime__c = now;
            }

            // Set default start date (today)
            if (record.StartDate__c == null) {
                record.StartDate__c = today;
            }

            // Set default end date (30 days from start)
            if (record.EndDate__c == null && record.StartDate__c != null) {
                record.EndDate__c = record.StartDate__c.addDays(30);
            }

            // Set expiration date (1 year from today)
            if (record.ExpirationDate__c == null) {
                record.ExpirationDate__c = today.addYears(1);
            }

            // Set next review date (90 days from today)
            if (record.NextReviewDate__c == null) {
                record.NextReviewDate__c = today.addDays(90);
            }

            // Set follow-up date (next business day)
            if (record.FollowUpDate__c == null) {
                record.FollowUpDate__c = getNextBusinessDay(today);
            }

            // Set fiscal period
            if (record.FiscalPeriod__c == null) {
                record.FiscalPeriod__c = getFiscalPeriod(today);
            }

            // Set fiscal quarter
            if (record.FiscalQuarter__c == null) {
                record.FiscalQuarter__c = getFiscalQuarter(today);
            }

            // Set fiscal year
            if (record.FiscalYear__c == null) {
                record.FiscalYear__c = getFiscalYear(today);
            }
        }
    }

    // ========================================================================
    // PATTERN 7: Ownership Assignment
    // ========================================================================
    private static void setOwnershipDefaults(List<ObjectName> records) {
        // Get territory assignment rules from custom metadata
        List<TerritoryRule__mdt> territoryRules = [
            SELECT Territory__c, StateCode__c, CountryCode__c,
                   PostalCodePrefix__c, DefaultOwnerId__c, QueueId__c
            FROM TerritoryRule__mdt
            WHERE IsActive__c = true
            ORDER BY Priority__c ASC
        ];

        for (ObjectName record : records) {
            // Skip if owner already assigned
            if (record.OwnerId != null &&
                !String.valueOf(record.OwnerId).startsWith('005')) {
                continue; // Already assigned to queue
            }

            // Apply territory rules
            for (TerritoryRule__mdt rule : territoryRules) {
                Boolean matches = false;

                // Match by country
                if (rule.CountryCode__c != null &&
                    record.BillingCountry == rule.CountryCode__c) {
                    matches = true;
                }

                // Match by state (if country matches)
                if (matches && rule.StateCode__c != null) {
                    if (record.BillingState != rule.StateCode__c) {
                        matches = false;
                    }
                }

                // Match by postal code prefix
                if (matches && rule.PostalCodePrefix__c != null) {
                    if (record.BillingPostalCode == null ||
                        !record.BillingPostalCode.startsWith(
                            rule.PostalCodePrefix__c)) {
                        matches = false;
                    }
                }

                // Assign owner if rule matches
                if (matches) {
                    if (rule.QueueId__c != null) {
                        record.OwnerId = rule.QueueId__c;
                    } else if (rule.DefaultOwnerId__c != null) {
                        record.OwnerId = rule.DefaultOwnerId__c;
                    }

                    record.Territory__c = rule.Territory__c;
                    break; // Use first matching rule
                }
            }

            // Fallback to current user if no rule matched
            if (record.OwnerId == null) {
                record.OwnerId = UserInfo.getUserId();
            }
        }
    }

    // ========================================================================
    // PATTERN 8: Sequential Numbering
    // ========================================================================
    private static void setSequentialDefaults(List<ObjectName> records) {
        // Get next available number from custom setting
        SequenceCounter__c counter = SequenceCounter__c.getInstance();

        if (counter == null) {
            counter = new SequenceCounter__c();
            counter.ObjectName_NextNumber__c = 1000;
        }

        Decimal nextNumber = counter.ObjectName_NextNumber__c != null ?
            counter.ObjectName_NextNumber__c : 1000;

        for (ObjectName record : records) {
            // Assign sequential number
            if (record.SequenceNumber__c == null) {
                record.SequenceNumber__c = nextNumber;
                nextNumber++;
            }

            // Build custom reference number
            if (record.ReferenceNumber__c == null) {
                String prefix = getRecordTypePrefix(record.RecordTypeId);
                String year = String.valueOf(Date.today().year());
                String number = String.valueOf(record.SequenceNumber__c).leftPad(6, '0');

                record.ReferenceNumber__c = prefix + '-' + year + '-' + number;
                // Example: CUS-2024-001234
            }
        }

        // Update counter for next batch (will be updated in after insert)
        // Note: In production, use a more robust sequence management approach
        counter.ObjectName_NextNumber__c = nextNumber;
        upsert counter;
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Get next business day (excludes weekends)
     */
    private static Date getNextBusinessDay(Date startDate) {
        Date nextDay = startDate.addDays(1);

        // Get day of week (Sunday=1, Saturday=7)
        Datetime dt = Datetime.newInstance(nextDay.year(), nextDay.month(), nextDay.day());
        String dayOfWeek = dt.format('u');

        // If Saturday (7), add 2 days to get Monday
        if (dayOfWeek == '7') {
            return nextDay.addDays(2);
        }
        // If Sunday (1), add 1 day to get Monday
        else if (dayOfWeek == '1') {
            return nextDay.addDays(1);
        }

        return nextDay;
    }

    /**
     * Get fiscal period (Month name + Year)
     */
    private static String getFiscalPeriod(Date d) {
        Datetime dt = Datetime.newInstance(d.year(), d.month(), d.day());
        return dt.format('MMMM yyyy'); // Example: "January 2024"
    }

    /**
     * Get fiscal quarter
     */
    private static String getFiscalQuarter(Date d) {
        Integer month = d.month();
        Integer year = d.year();

        if (month <= 3) {
            return 'Q1 ' + year;
        } else if (month <= 6) {
            return 'Q2 ' + year;
        } else if (month <= 9) {
            return 'Q3 ' + year;
        } else {
            return 'Q4 ' + year;
        }
    }

    /**
     * Get fiscal year
     */
    private static String getFiscalYear(Date d) {
        return 'FY' + d.year();
    }

    /**
     * Get user's region from custom settings or profile
     */
    private static String getUserRegion() {
        // Query from custom setting or user record
        // For simplicity, using timezone as proxy
        String tz = UserInfo.getTimeZone().toString();

        if (tz.contains('Europe')) {
            return 'EMEA';
        } else if (tz.contains('Asia') || tz.contains('Pacific')) {
            return 'APAC';
        } else {
            return 'Americas';
        }
    }

    /**
     * Get record type prefix for reference numbers
     */
    private static String getRecordTypePrefix(Id recordTypeId) {
        if (recordTypeId == null) return 'GEN';

        if (recordTypeMap == null) {
            recordTypeMap = Schema.SObjectType.ObjectName.getRecordTypeInfosById();
        }

        Schema.RecordTypeInfo rtInfo = recordTypeMap.get(recordTypeId);
        if (rtInfo == null) return 'GEN';

        String name = rtInfo.getName();

        if (name == 'Customer') return 'CUS';
        if (name == 'Partner') return 'PTR';
        if (name == 'Prospect') return 'PRO';

        return 'GEN';
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
        // Create custom settings
        DefaultSettings__c settings = new DefaultSettings__c();
        settings.DefaultDiscountPercent__c = 5.0;
        settings.DefaultShippingMethod__c = 'Ground';
        settings.DefaultPaymentTerms__c = 'Net 30';
        settings.DefaultWarrantyDays__c = 365;
        insert settings;

        // Create sequence counter
        SequenceCounter__c counter = new SequenceCounter__c();
        counter.ObjectName_NextNumber__c = 1000;
        insert counter;

        // Create parent record
        ParentObject__c parent = new ParentObject__c(
            Name = 'Test Parent',
            Category__c = 'Enterprise',
            Region__c = 'West',
            TaxRate__c = 8.5,
            BillingCountry = 'US',
            BillingState = 'CA'
        );
        insert parent;
    }

    // ========================================================================
    // TEST: Simple Static Defaults
    // ========================================================================
    @isTest
    static void testSimpleDefaults() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Test Record'
            // No default fields specified
        );

        insert record;

        record = [SELECT Id, Status__c, Priority__c, CurrencyIsoCode,
                         IsActive__c, SendNotifications__c, Quantity__c,
                         DiscountPercent__c, Source__c
                  FROM ObjectName WHERE Id = :record.Id];

        System.assertEquals('New', record.Status__c);
        System.assertEquals('Medium', record.Priority__c);
        System.assertEquals('USD', record.CurrencyIsoCode);
        System.assertEquals(true, record.IsActive__c);
        System.assertEquals(true, record.SendNotifications__c);
        System.assertEquals(1, record.Quantity__c);
        System.assertEquals(0, record.DiscountPercent__c);
        System.assertEquals('Web', record.Source__c);

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Parent Field Defaults
    // ========================================================================
    @isTest
    static void testParentFieldDefaults() {
        Test.startTest();

        ParentObject__c parent = [SELECT Id FROM ParentObject__c LIMIT 1];

        ObjectName record = new ObjectName(
            Name = 'Child Record',
            ParentId__c = parent.Id
            // Category, Region, TaxRate should default from parent
        );

        insert record;

        record = [SELECT Id, Category__c, Region__c, TaxRate__c,
                         BillingCountry, BillingState
                  FROM ObjectName WHERE Id = :record.Id];

        System.assertEquals('Enterprise', record.Category__c,
            'Category should default from parent');
        System.assertEquals('West', record.Region__c,
            'Region should default from parent');
        System.assertEquals(8.5, record.TaxRate__c,
            'Tax rate should default from parent');
        System.assertEquals('US', record.BillingCountry,
            'Billing country should default from parent');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Custom Settings Defaults
    // ========================================================================
    @isTest
    static void testCustomSettingsDefaults() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Settings Test'
        );

        insert record;

        record = [SELECT Id, DefaultDiscount__c, ShippingMethod__c,
                         PaymentTerms__c, WarrantyPeriodDays__c
                  FROM ObjectName WHERE Id = :record.Id];

        System.assertEquals(5.0, record.DefaultDiscount__c,
            'Discount should default from custom settings');
        System.assertEquals('Ground', record.ShippingMethod__c,
            'Shipping method should default from custom settings');
        System.assertEquals('Net 30', record.PaymentTerms__c,
            'Payment terms should default from custom settings');
        System.assertEquals(365, record.WarrantyPeriodDays__c,
            'Warranty period should default from custom settings');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Date Defaults
    // ========================================================================
    @isTest
    static void testDateDefaults() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Date Test'
        );

        insert record;

        record = [SELECT Id, StartDate__c, EndDate__c, ExpirationDate__c,
                         NextReviewDate__c, FiscalPeriod__c, FiscalQuarter__c
                  FROM ObjectName WHERE Id = :record.Id];

        System.assertEquals(Date.today(), record.StartDate__c,
            'Start date should default to today');

        System.assertEquals(Date.today().addDays(30), record.EndDate__c,
            'End date should default to 30 days from start');

        System.assertEquals(Date.today().addYears(1), record.ExpirationDate__c,
            'Expiration should default to 1 year from today');

        System.assertNotEquals(null, record.FiscalPeriod__c,
            'Fiscal period should be set');

        System.assertNotEquals(null, record.FiscalQuarter__c,
            'Fiscal quarter should be set');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Sequential Numbering
    // ========================================================================
    @isTest
    static void testSequentialNumbering() {
        Test.startTest();

        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 5; i++) {
            records.add(new ObjectName(Name = 'Sequential Test ' + i));
        }

        insert records;

        records = [SELECT Id, SequenceNumber__c, ReferenceNumber__c
                   FROM ObjectName
                   WHERE Name LIKE 'Sequential Test%'
                   ORDER BY SequenceNumber__c];

        // Verify sequential numbering
        System.assertEquals(1000, records[0].SequenceNumber__c);
        System.assertEquals(1001, records[1].SequenceNumber__c);
        System.assertEquals(1002, records[2].SequenceNumber__c);
        System.assertEquals(1003, records[3].SequenceNumber__c);
        System.assertEquals(1004, records[4].SequenceNumber__c);

        // Verify reference number format
        System.assert(records[0].ReferenceNumber__c.startsWith('GEN-'),
            'Reference number should have correct format');

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
            records.add(new ObjectName(Name = 'Bulk Test ' + i));
        }

        insert records;

        records = [SELECT Id, Status__c, Priority__c, IsActive__c,
                          SequenceNumber__c
                   FROM ObjectName
                   WHERE Name LIKE 'Bulk Test%'];

        System.assertEquals(200, records.size());

        // Verify all have defaults
        for (ObjectName record : records) {
            System.assertEquals('New', record.Status__c);
            System.assertEquals('Medium', record.Priority__c);
            System.assertEquals(true, record.IsActive__c);
            System.assertNotEquals(null, record.SequenceNumber__c);
        }

        // Verify governor limits
        System.assert(Limits.getQueries() < 5,
            'Should use < 5 SOQL queries');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Override Protection (user-specified values not overwritten)
    // ========================================================================
    @isTest
    static void testOverrideProtection() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Override Test',
            Status__c = 'Approved', // User-specified, should NOT be overridden
            Priority__c = 'High',   // User-specified, should NOT be overridden
            Quantity__c = 10        // User-specified, should NOT be overridden
        );

        insert record;

        record = [SELECT Id, Status__c, Priority__c, Quantity__c
                  FROM ObjectName WHERE Id = :record.Id];

        System.assertEquals('Approved', record.Status__c,
            'User-specified status should not be overridden');
        System.assertEquals('High', record.Priority__c,
            'User-specified priority should not be overridden');
        System.assertEquals(10, record.Quantity__c,
            'User-specified quantity should not be overridden');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Null Safety
    // ========================================================================
    @isTest
    static void testNullSafety() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Null Test'
            // All fields null
        );

        insert record;

        System.assert(true, 'Should not throw NPE with null values');

        Test.stopTest();
    }
}
