/**
 * Calculated Fields Template
 *
 * USE CASE: Calculate field values based on complex logic that exceeds formula field limits
 *
 * When to use this template:
 * - Calculations requiring SOQL queries (aggregations from child records)
 * - Multi-step calculations with intermediate values
 * - Calculations requiring external data or custom settings
 * - Complex date/time calculations (business days, fiscal periods)
 * - Calculations that exceed formula field character limits (3,900 chars)
 * - Calculations requiring try-catch error handling
 *
 * COMPLEXITY: Simple
 * GOVERNOR LIMITS: Target < 5 SOQL queries, < 3 DML operations
 *
 * CUSTOMIZATION CHECKLIST:
 * 1. Replace ObjectName with your object API name
 * 2. Replace calculated field names (TotalRevenue__c, etc.) with your fields
 * 3. Implement your calculation logic in helper methods
 * 4. Update test class with your field names
 * 5. Verify all calculated fields are writeable (not formulas)
 * 6. Consider performance impact of complex calculations on large batches
 */

// ============================================================================
// TRIGGER FILE: ObjectNameTrigger.trigger
// ============================================================================
trigger ObjectNameTrigger on ObjectName (before insert, before update) {
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
            if (Trigger.isBefore) {
                if (Trigger.isInsert) {
                    handleBeforeInsert(Trigger.new);
                } else if (Trigger.isUpdate) {
                    handleBeforeUpdate(Trigger.new, Trigger.oldMap);
                }
            }
        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // BEFORE INSERT - Calculate fields for new records
    // ========================================================================
    private static void handleBeforeInsert(List<ObjectName> newRecords) {
        calculateBasicFields(newRecords);
        calculateDateFields(newRecords);
        calculateAggregateFields(newRecords);
        calculateFinancialFields(newRecords);
    }

    // ========================================================================
    // BEFORE UPDATE - Recalculate fields when dependencies change
    // ========================================================================
    private static void handleBeforeUpdate(List<ObjectName> newRecords,
                                           Map<Id, ObjectName> oldMap) {
        // Only recalculate if dependency fields changed
        List<ObjectName> recordsToRecalculate = new List<ObjectName>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Check if any dependency fields changed
            if (hasRelevantChanges(newRecord, oldRecord)) {
                recordsToRecalculate.add(newRecord);
            }
        }

        if (!recordsToRecalculate.isEmpty()) {
            calculateBasicFields(recordsToRecalculate);
            calculateDateFields(recordsToRecalculate);
            calculateAggregateFields(recordsToRecalculate);
            calculateFinancialFields(recordsToRecalculate);
        }
    }

    // ========================================================================
    // HELPER: Check if recalculation needed
    // ========================================================================
    private static Boolean hasRelevantChanges(ObjectName newRecord,
                                               ObjectName oldRecord) {
        // Add all fields that calculations depend on
        return newRecord.BaseAmount__c != oldRecord.BaseAmount__c
            || newRecord.Quantity__c != oldRecord.Quantity__c
            || newRecord.DiscountPercent__c != oldRecord.DiscountPercent__c
            || newRecord.StartDate__c != oldRecord.StartDate__c
            || newRecord.EndDate__c != oldRecord.EndDate__c
            || newRecord.ParentId__c != oldRecord.ParentId__c;
    }

    // ========================================================================
    // PATTERN 1: Basic Mathematical Calculations
    // ========================================================================
    private static void calculateBasicFields(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Calculate subtotal (Quantity × Price)
            if (record.Quantity__c != null && record.UnitPrice__c != null) {
                record.Subtotal__c = record.Quantity__c * record.UnitPrice__c;
            }

            // Calculate discount amount
            if (record.Subtotal__c != null && record.DiscountPercent__c != null) {
                record.DiscountAmount__c = record.Subtotal__c *
                    (record.DiscountPercent__c / 100);
            }

            // Calculate total (Subtotal - Discount)
            if (record.Subtotal__c != null && record.DiscountAmount__c != null) {
                record.Total__c = record.Subtotal__c - record.DiscountAmount__c;
            }

            // Calculate tax
            if (record.Total__c != null && record.TaxRate__c != null) {
                record.TaxAmount__c = record.Total__c * (record.TaxRate__c / 100);
            }

            // Calculate grand total
            if (record.Total__c != null && record.TaxAmount__c != null) {
                record.GrandTotal__c = record.Total__c + record.TaxAmount__c;
            }

            // Calculate margin (with null safety)
            if (record.Total__c != null && record.Cost__c != null &&
                record.Total__c > 0) {
                Decimal margin = record.Total__c - record.Cost__c;
                record.MarginPercent__c = (margin / record.Total__c) * 100;
            }
        }
    }

    // ========================================================================
    // PATTERN 2: Date/Time Calculations
    // ========================================================================
    private static void calculateDateFields(List<ObjectName> records) {
        for (ObjectName record : records) {
            // Calculate duration in days
            if (record.StartDate__c != null && record.EndDate__c != null) {
                record.DurationDays__c =
                    record.StartDate__c.daysBetween(record.EndDate__c);
            }

            // Calculate duration in months (approximate)
            if (record.StartDate__c != null && record.EndDate__c != null) {
                Integer days = record.StartDate__c.daysBetween(record.EndDate__c);
                record.DurationMonths__c = days / 30.0;
            }

            // Calculate expiration date (90 days from start)
            if (record.StartDate__c != null) {
                record.ExpirationDate__c = record.StartDate__c.addDays(90);
            }

            // Calculate days until expiration
            if (record.ExpirationDate__c != null) {
                record.DaysUntilExpiration__c =
                    Date.today().daysBetween(record.ExpirationDate__c);
            }

            // Set expiration status flag
            if (record.DaysUntilExpiration__c != null) {
                record.IsExpiringSoon__c =
                    record.DaysUntilExpiration__c <= 30 &&
                    record.DaysUntilExpiration__c > 0;

                record.IsExpired__c = record.DaysUntilExpiration__c <= 0;
            }

            // Calculate business days (simplified - excludes holidays)
            if (record.StartDate__c != null && record.EndDate__c != null) {
                record.BusinessDays__c =
                    calculateBusinessDays(record.StartDate__c, record.EndDate__c);
            }

            // Calculate fiscal quarter
            if (record.StartDate__c != null) {
                record.FiscalQuarter__c = getFiscalQuarter(record.StartDate__c);
            }
        }
    }

    // ========================================================================
    // PATTERN 3: Aggregate Calculations (from child records)
    // ========================================================================
    private static void calculateAggregateFields(List<ObjectName> records) {
        // Step 1: Collect record IDs that need child aggregations
        Set<Id> recordIds = new Set<Id>();
        for (ObjectName record : records) {
            if (record.Id != null) {
                recordIds.add(record.Id);
            }
        }

        if (recordIds.isEmpty()) return;

        // Step 2: Query child record aggregations (SINGLE query)
        Map<Id, AggregateResult> childAggregates = new Map<Id, AggregateResult>();

        for (AggregateResult ar : [
            SELECT ParentId__c parentId,
                   COUNT(Id) recordCount,
                   SUM(Amount__c) totalAmount,
                   AVG(Amount__c) avgAmount,
                   MAX(Amount__c) maxAmount,
                   MIN(Amount__c) minAmount
            FROM ChildObject__c
            WHERE ParentId__c IN :recordIds
              AND IsActive__c = true
            GROUP BY ParentId__c
        ]) {
            childAggregates.put((Id)ar.get('parentId'), ar);
        }

        // Step 3: Update calculated fields
        for (ObjectName record : records) {
            if (record.Id != null && childAggregates.containsKey(record.Id)) {
                AggregateResult ar = childAggregates.get(record.Id);

                record.ChildCount__c = (Decimal)ar.get('recordCount');
                record.ChildTotalAmount__c = (Decimal)ar.get('totalAmount');
                record.ChildAvgAmount__c = (Decimal)ar.get('avgAmount');
                record.ChildMaxAmount__c = (Decimal)ar.get('maxAmount');
                record.ChildMinAmount__c = (Decimal)ar.get('minAmount');

                // Calculate weighted average if needed
                if (record.ChildTotalAmount__c != null &&
                    record.ChildCount__c != null &&
                    record.ChildCount__c > 0) {
                    record.WeightedAverage__c =
                        record.ChildTotalAmount__c / record.ChildCount__c;
                }
            } else {
                // No children - set to zero
                record.ChildCount__c = 0;
                record.ChildTotalAmount__c = 0;
                record.ChildAvgAmount__c = 0;
            }
        }
    }

    // ========================================================================
    // PATTERN 4: Financial Calculations
    // ========================================================================
    private static void calculateFinancialFields(List<ObjectName> records) {
        // Get exchange rates from custom settings (cached)
        Map<String, Decimal> exchangeRates = getExchangeRates();

        for (ObjectName record : records) {
            // Currency conversion
            if (record.Amount__c != null && record.CurrencyCode__c != null) {
                Decimal rate = exchangeRates.get(record.CurrencyCode__c);
                if (rate != null) {
                    record.AmountUSD__c = record.Amount__c * rate;
                }
            }

            // Calculate annual recurring revenue (ARR)
            if (record.MonthlyRecurringRevenue__c != null) {
                record.AnnualRecurringRevenue__c =
                    record.MonthlyRecurringRevenue__c * 12;
            }

            // Calculate customer lifetime value (simplified)
            if (record.AnnualRecurringRevenue__c != null &&
                record.ExpectedLifetimeYears__c != null) {
                record.CustomerLifetimeValue__c =
                    record.AnnualRecurringRevenue__c *
                    record.ExpectedLifetimeYears__c;
            }

            // Calculate ROI
            if (record.Revenue__c != null && record.Cost__c != null &&
                record.Cost__c > 0) {
                Decimal profit = record.Revenue__c - record.Cost__c;
                record.ROI_Percent__c = (profit / record.Cost__c) * 100;
            }

            // Calculate payback period (months)
            if (record.InitialInvestment__c != null &&
                record.MonthlyRecurringRevenue__c != null &&
                record.MonthlyRecurringRevenue__c > 0) {
                record.PaybackPeriodMonths__c =
                    record.InitialInvestment__c /
                    record.MonthlyRecurringRevenue__c;
            }

            // Calculate compound growth rate (CAGR)
            if (record.InitialValue__c != null &&
                record.FinalValue__c != null &&
                record.Years__c != null &&
                record.Years__c > 0 &&
                record.InitialValue__c > 0) {
                Decimal ratio = record.FinalValue__c / record.InitialValue__c;
                record.CAGR_Percent__c =
                    (Math.pow(ratio, 1.0 / record.Years__c) - 1) * 100;
            }
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Calculate business days between two dates (excludes weekends)
     * Note: Does not exclude holidays - add custom logic if needed
     */
    private static Integer calculateBusinessDays(Date startDate, Date endDate) {
        Integer businessDays = 0;
        Date currentDate = startDate;

        while (currentDate <= endDate) {
            // Get day of week (Sunday=1, Saturday=7)
            String dayOfWeek = Datetime.newInstance(
                currentDate.year(),
                currentDate.month(),
                currentDate.day()
            ).format('u');

            // Count Monday-Friday (2-6)
            if (dayOfWeek != '1' && dayOfWeek != '7') {
                businessDays++;
            }

            currentDate = currentDate.addDays(1);
        }

        return businessDays;
    }

    /**
     * Get fiscal quarter (assuming fiscal year starts in January)
     * Customize for different fiscal year start months
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
     * Get exchange rates from custom settings (cached)
     * Replace with your exchange rate data source
     */
    private static Map<String, Decimal> exchangeRates;

    private static Map<String, Decimal> getExchangeRates() {
        if (exchangeRates == null) {
            exchangeRates = new Map<String, Decimal>();

            // Query from custom settings or external source
            // Example: Static values
            exchangeRates.put('USD', 1.0);
            exchangeRates.put('EUR', 1.10);
            exchangeRates.put('GBP', 1.25);
            exchangeRates.put('JPY', 0.0091);
            exchangeRates.put('CAD', 0.80);

            // Or query from custom metadata:
            // for (ExchangeRate__mdt rate : [SELECT CurrencyCode__c, Rate__c
            //                                FROM ExchangeRate__mdt]) {
            //     exchangeRates.put(rate.CurrencyCode__c, rate.Rate__c);
            // }
        }

        return exchangeRates;
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
        // Create test records with various calculation scenarios
        List<ObjectName> testRecords = new List<ObjectName>();

        // Record 1: Basic calculations
        testRecords.add(new ObjectName(
            Name = 'Test Record 1',
            Quantity__c = 10,
            UnitPrice__c = 100.00,
            DiscountPercent__c = 10,
            TaxRate__c = 8.5,
            Cost__c = 500.00,
            StartDate__c = Date.today(),
            EndDate__c = Date.today().addDays(90),
            CurrencyCode__c = 'USD',
            MonthlyRecurringRevenue__c = 1000.00,
            ExpectedLifetimeYears__c = 3
        ));

        // Record 2: Date calculations
        testRecords.add(new ObjectName(
            Name = 'Test Record 2',
            StartDate__c = Date.newInstance(2024, 1, 1),
            EndDate__c = Date.newInstance(2024, 12, 31)
        ));

        // Record 3: Financial calculations
        testRecords.add(new ObjectName(
            Name = 'Test Record 3',
            Revenue__c = 100000,
            Cost__c = 60000,
            InitialInvestment__c = 50000,
            MonthlyRecurringRevenue__c = 5000,
            InitialValue__c = 10000,
            FinalValue__c = 20000,
            Years__c = 5
        ));

        insert testRecords;

        // Create child records for aggregate calculations
        List<ChildObject__c> children = new List<ChildObject__c>();
        for (Integer i = 0; i < 5; i++) {
            children.add(new ChildObject__c(
                ParentId__c = testRecords[0].Id,
                Amount__c = 100 + (i * 10),
                IsActive__c = true
            ));
        }
        insert children;
    }

    // ========================================================================
    // TEST: Basic Mathematical Calculations
    // ========================================================================
    @isTest
    static void testBasicCalculations() {
        Test.startTest();

        ObjectName record = [SELECT Id, Name, Quantity__c, UnitPrice__c,
                                    DiscountPercent__c, TaxRate__c, Cost__c,
                                    Subtotal__c, DiscountAmount__c, Total__c,
                                    TaxAmount__c, GrandTotal__c, MarginPercent__c
                             FROM ObjectName
                             WHERE Name = 'Test Record 1' LIMIT 1];

        // Verify calculations
        System.assertEquals(1000.00, record.Subtotal__c,
            'Subtotal should be 10 × 100 = 1000');

        System.assertEquals(100.00, record.DiscountAmount__c,
            'Discount should be 1000 × 10% = 100');

        System.assertEquals(900.00, record.Total__c,
            'Total should be 1000 - 100 = 900');

        System.assertEquals(76.50, record.TaxAmount__c,
            'Tax should be 900 × 8.5% = 76.50');

        System.assertEquals(976.50, record.GrandTotal__c,
            'Grand total should be 900 + 76.50 = 976.50');

        // Verify margin calculation
        Decimal expectedMargin = ((900 - 500) / 900) * 100;
        System.assertEquals(expectedMargin, record.MarginPercent__c, 0.01,
            'Margin % should be ((900-500)/900)*100 = 44.44%');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Date/Time Calculations
    // ========================================================================
    @isTest
    static void testDateCalculations() {
        Test.startTest();

        ObjectName record = [SELECT Id, Name, StartDate__c, EndDate__c,
                                    DurationDays__c, DurationMonths__c,
                                    ExpirationDate__c, DaysUntilExpiration__c,
                                    IsExpiringSoon__c, IsExpired__c,
                                    BusinessDays__c, FiscalQuarter__c
                             FROM ObjectName
                             WHERE Name = 'Test Record 1' LIMIT 1];

        // Verify duration calculations
        System.assertEquals(90, record.DurationDays__c,
            'Duration should be 90 days');

        System.assertEquals(3.0, record.DurationMonths__c,
            'Duration should be approximately 3 months');

        // Verify expiration date (90 days from start)
        System.assertEquals(Date.today().addDays(90), record.ExpirationDate__c,
            'Expiration should be 90 days from start date');

        // Verify business days calculation
        System.assertNotEquals(null, record.BusinessDays__c,
            'Business days should be calculated');

        // Verify fiscal quarter
        System.assertNotEquals(null, record.FiscalQuarter__c,
            'Fiscal quarter should be calculated');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Aggregate Calculations
    // ========================================================================
    @isTest
    static void testAggregateCalculations() {
        Test.startTest();

        // Force recalculation by updating parent
        ObjectName record = [SELECT Id FROM ObjectName
                             WHERE Name = 'Test Record 1' LIMIT 1];

        record.Quantity__c = 20; // Force recalc
        update record;

        // Query with calculated fields
        record = [SELECT Id, ChildCount__c, ChildTotalAmount__c,
                         ChildAvgAmount__c, ChildMaxAmount__c, ChildMinAmount__c,
                         WeightedAverage__c
                  FROM ObjectName
                  WHERE Id = :record.Id];

        // Verify aggregations
        System.assertEquals(5, record.ChildCount__c,
            'Should have 5 child records');

        System.assertEquals(600, record.ChildTotalAmount__c,
            'Total amount should be 100+110+120+130+140 = 600');

        System.assertEquals(120, record.ChildAvgAmount__c,
            'Average should be 600/5 = 120');

        System.assertEquals(140, record.ChildMaxAmount__c,
            'Max should be 140');

        System.assertEquals(100, record.ChildMinAmount__c,
            'Min should be 100');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Financial Calculations
    // ========================================================================
    @isTest
    static void testFinancialCalculations() {
        Test.startTest();

        ObjectName record1 = [SELECT Id, MonthlyRecurringRevenue__c,
                                     AnnualRecurringRevenue__c,
                                     ExpectedLifetimeYears__c,
                                     CustomerLifetimeValue__c
                              FROM ObjectName
                              WHERE Name = 'Test Record 1' LIMIT 1];

        // Verify ARR calculation
        System.assertEquals(12000.00, record1.AnnualRecurringRevenue__c,
            'ARR should be MRR × 12 = 12000');

        // Verify CLV calculation
        System.assertEquals(36000.00, record1.CustomerLifetimeValue__c,
            'CLV should be ARR × Years = 36000');

        ObjectName record3 = [SELECT Id, Revenue__c, Cost__c, ROI_Percent__c,
                                     InitialInvestment__c, PaybackPeriodMonths__c,
                                     CAGR_Percent__c
                              FROM ObjectName
                              WHERE Name = 'Test Record 3' LIMIT 1];

        // Verify ROI calculation
        Decimal expectedROI = ((100000 - 60000) / 60000) * 100;
        System.assertEquals(expectedROI, record3.ROI_Percent__c, 0.01,
            'ROI should be ((100000-60000)/60000)*100 = 66.67%');

        // Verify payback period
        System.assertEquals(10, record3.PaybackPeriodMonths__c,
            'Payback period should be 50000/5000 = 10 months');

        // Verify CAGR calculation
        System.assertNotEquals(null, record3.CAGR_Percent__c,
            'CAGR should be calculated');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Bulk Operations (200 records)
    // ========================================================================
    @isTest
    static void testBulkOperations() {
        Test.startTest();

        // Create 200 records
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Bulk Test ' + i,
                Quantity__c = i + 1,
                UnitPrice__c = 100,
                DiscountPercent__c = 5,
                TaxRate__c = 8,
                Cost__c = 50 * (i + 1),
                StartDate__c = Date.today(),
                EndDate__c = Date.today().addDays(30),
                MonthlyRecurringRevenue__c = 1000
            ));
        }

        insert records;

        // Verify all calculations completed
        List<ObjectName> inserted = [SELECT Id, Subtotal__c, Total__c,
                                             GrandTotal__c, MarginPercent__c,
                                             DurationDays__c, AnnualRecurringRevenue__c
                                      FROM ObjectName
                                      WHERE Name LIKE 'Bulk Test%'];

        System.assertEquals(200, inserted.size(),
            'Should insert 200 records');

        for (ObjectName record : inserted) {
            System.assertNotEquals(null, record.Subtotal__c,
                'Subtotal should be calculated');
            System.assertNotEquals(null, record.Total__c,
                'Total should be calculated');
            System.assertNotEquals(null, record.GrandTotal__c,
                'Grand total should be calculated');
            System.assertNotEquals(null, record.AnnualRecurringRevenue__c,
                'ARR should be calculated');
        }

        // Verify governor limits
        System.assert(Limits.getQueries() < 10,
            'Should use < 10 SOQL queries');
        System.assert(Limits.getDMLStatements() < 5,
            'Should use < 5 DML statements');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Update Recalculation (only when dependencies change)
    // ========================================================================
    @isTest
    static void testUpdateRecalculation() {
        Test.startTest();

        ObjectName record = [SELECT Id, Quantity__c, UnitPrice__c,
                                    Subtotal__c, Total__c
                             FROM ObjectName
                             WHERE Name = 'Test Record 1' LIMIT 1];

        Decimal originalSubtotal = record.Subtotal__c;

        // Update quantity (should recalculate)
        record.Quantity__c = 20;
        update record;

        record = [SELECT Id, Subtotal__c, Total__c
                  FROM ObjectName WHERE Id = :record.Id];

        System.assertNotEquals(originalSubtotal, record.Subtotal__c,
            'Subtotal should be recalculated when quantity changes');

        System.assertEquals(2000.00, record.Subtotal__c,
            'New subtotal should be 20 × 100 = 2000');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Null Safety
    // ========================================================================
    @isTest
    static void testNullSafety() {
        Test.startTest();

        // Create record with minimal data (most fields null)
        ObjectName record = new ObjectName(
            Name = 'Null Test'
        );

        // Should not throw exceptions
        insert record;

        record = [SELECT Id, Subtotal__c, Total__c, GrandTotal__c,
                         DurationDays__c, ChildCount__c
                  FROM ObjectName WHERE Id = :record.Id];

        // Verify null handling (no NPE)
        System.assertEquals(null, record.Subtotal__c,
            'Subtotal should remain null when inputs are null');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Recursion Prevention
    // ========================================================================
    @isTest
    static void testRecursionPrevention() {
        Test.startTest();

        ObjectName record = [SELECT Id FROM ObjectName
                             WHERE Name = 'Test Record 1' LIMIT 1];

        // Update multiple times rapidly
        for (Integer i = 0; i < 5; i++) {
            record.Quantity__c = 10 + i;
            update record;
        }

        // Should not hit recursion issues
        System.assert(true, 'Multiple updates should not cause recursion');

        Test.stopTest();
    }
}
