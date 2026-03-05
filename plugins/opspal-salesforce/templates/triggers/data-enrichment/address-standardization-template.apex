/**
 * Address Standardization Template
 *
 * USE CASE: Standardize address fields to ensure data consistency and quality
 *
 * When to use this template:
 * - Normalize address formatting (uppercase, proper case)
 * - Standardize country/state codes (United States → US, California → CA)
 * - Clean postal codes (remove spaces, validate format)
 * - Parse combined address fields into components
 * - Validate address formats (ZIP codes, country-specific patterns)
 * - Geocode addresses (latitude/longitude lookup)
 * - Detect duplicate addresses with different formats
 *
 * COMPLEXITY: Simple
 * GOVERNOR LIMITS: Target < 3 SOQL queries, 0 DML operations (before trigger)
 *
 * CUSTOMIZATION CHECKLIST:
 * 1. Replace ObjectName with your object API name
 * 2. Replace address field names (BillingStreet, etc.) with your fields
 * 3. Update country/state mapping tables with your requirements
 * 4. Configure postal code validation patterns for your regions
 * 5. Add/remove address types (Billing, Shipping, Mailing, etc.)
 * 6. Consider integration with external geocoding services if needed
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
    // BEFORE INSERT - Standardize all addresses for new records
    // ========================================================================
    private static void handleBeforeInsert(List<ObjectName> newRecords) {
        for (ObjectName record : newRecords) {
            standardizeBillingAddress(record);
            standardizeShippingAddress(record);
            standardizeMailingAddress(record);
        }
    }

    // ========================================================================
    // BEFORE UPDATE - Restandardize when addresses change
    // ========================================================================
    private static void handleBeforeUpdate(List<ObjectName> newRecords,
                                           Map<Id, ObjectName> oldMap) {
        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Only restandardize if billing address changed
            if (hasBillingAddressChanged(newRecord, oldRecord)) {
                standardizeBillingAddress(newRecord);
            }

            // Only restandardize if shipping address changed
            if (hasShippingAddressChanged(newRecord, oldRecord)) {
                standardizeShippingAddress(newRecord);
            }

            // Only restandardize if mailing address changed
            if (hasMailingAddressChanged(newRecord, oldRecord)) {
                standardizeMailingAddress(newRecord);
            }
        }
    }

    // ========================================================================
    // PATTERN 1: Standardize Billing Address
    // ========================================================================
    private static void standardizeBillingAddress(ObjectName record) {
        if (record.BillingStreet == null &&
            record.BillingCity == null &&
            record.BillingCountry == null) {
            return; // No address to standardize
        }

        // 1. Uppercase street address
        if (record.BillingStreet != null) {
            record.BillingStreet = standardizeStreet(record.BillingStreet);
        }

        // 2. Proper case city
        if (record.BillingCity != null) {
            record.BillingCity = toProperCase(record.BillingCity.trim());
        }

        // 3. Standardize state/province code
        if (record.BillingState != null) {
            record.BillingState = standardizeState(
                record.BillingState,
                record.BillingCountry
            );
        }

        // 4. Standardize country code (ISO 3166-1 alpha-2)
        if (record.BillingCountry != null) {
            record.BillingCountry = standardizeCountry(record.BillingCountry);
        }

        // 5. Standardize postal code
        if (record.BillingPostalCode != null) {
            record.BillingPostalCode = standardizePostalCode(
                record.BillingPostalCode,
                record.BillingCountry
            );
        }

        // 6. Build standardized full address (for searching/matching)
        record.BillingAddressStandardized__c = buildStandardizedAddress(
            record.BillingStreet,
            record.BillingCity,
            record.BillingState,
            record.BillingPostalCode,
            record.BillingCountry
        );

        // 7. Validate address format
        String validationError = validateAddress(
            record.BillingStreet,
            record.BillingCity,
            record.BillingState,
            record.BillingPostalCode,
            record.BillingCountry
        );

        if (validationError != null) {
            record.BillingAddressValidation__c = validationError;
        } else {
            record.BillingAddressValidation__c = 'Valid';
        }
    }

    // ========================================================================
    // PATTERN 2: Standardize Shipping Address
    // ========================================================================
    private static void standardizeShippingAddress(ObjectName record) {
        if (record.ShippingStreet == null &&
            record.ShippingCity == null &&
            record.ShippingCountry == null) {
            return; // No address to standardize
        }

        // 1. Uppercase street address
        if (record.ShippingStreet != null) {
            record.ShippingStreet = standardizeStreet(record.ShippingStreet);
        }

        // 2. Proper case city
        if (record.ShippingCity != null) {
            record.ShippingCity = toProperCase(record.ShippingCity.trim());
        }

        // 3. Standardize state/province code
        if (record.ShippingState != null) {
            record.ShippingState = standardizeState(
                record.ShippingState,
                record.ShippingCountry
            );
        }

        // 4. Standardize country code
        if (record.ShippingCountry != null) {
            record.ShippingCountry = standardizeCountry(record.ShippingCountry);
        }

        // 5. Standardize postal code
        if (record.ShippingPostalCode != null) {
            record.ShippingPostalCode = standardizePostalCode(
                record.ShippingPostalCode,
                record.ShippingCountry
            );
        }

        // 6. Build standardized full address
        record.ShippingAddressStandardized__c = buildStandardizedAddress(
            record.ShippingStreet,
            record.ShippingCity,
            record.ShippingState,
            record.ShippingPostalCode,
            record.ShippingCountry
        );

        // 7. Validate address format
        String validationError = validateAddress(
            record.ShippingStreet,
            record.ShippingCity,
            record.ShippingState,
            record.ShippingPostalCode,
            record.ShippingCountry
        );

        if (validationError != null) {
            record.ShippingAddressValidation__c = validationError;
        } else {
            record.ShippingAddressValidation__c = 'Valid';
        }
    }

    // ========================================================================
    // PATTERN 3: Standardize Mailing Address (Custom Fields)
    // ========================================================================
    private static void standardizeMailingAddress(ObjectName record) {
        if (record.MailingStreet__c == null &&
            record.MailingCity__c == null &&
            record.MailingCountry__c == null) {
            return; // No address to standardize
        }

        // Same pattern as Billing/Shipping
        if (record.MailingStreet__c != null) {
            record.MailingStreet__c = standardizeStreet(record.MailingStreet__c);
        }

        if (record.MailingCity__c != null) {
            record.MailingCity__c = toProperCase(record.MailingCity__c.trim());
        }

        if (record.MailingState__c != null) {
            record.MailingState__c = standardizeState(
                record.MailingState__c,
                record.MailingCountry__c
            );
        }

        if (record.MailingCountry__c != null) {
            record.MailingCountry__c = standardizeCountry(record.MailingCountry__c);
        }

        if (record.MailingPostalCode__c != null) {
            record.MailingPostalCode__c = standardizePostalCode(
                record.MailingPostalCode__c,
                record.MailingCountry__c
            );
        }
    }

    // ========================================================================
    // UTILITY: Standardize Street Address
    // ========================================================================
    private static String standardizeStreet(String street) {
        if (street == null) return null;

        String standardized = street.trim();

        // Uppercase entire street address
        standardized = standardized.toUpperCase();

        // Remove excess whitespace
        standardized = standardized.replaceAll('\\s+', ' ');

        // Standardize common abbreviations
        standardized = standardized.replace(' STREET', ' ST');
        standardized = standardized.replace(' AVENUE', ' AVE');
        standardized = standardized.replace(' BOULEVARD', ' BLVD');
        standardized = standardized.replace(' DRIVE', ' DR');
        standardized = standardized.replace(' ROAD', ' RD');
        standardized = standardized.replace(' LANE', ' LN');
        standardized = standardized.replace(' COURT', ' CT');
        standardized = standardized.replace(' PLACE', ' PL');
        standardized = standardized.replace(' SUITE', ' STE');
        standardized = standardized.replace(' APARTMENT', ' APT');
        standardized = standardized.replace(' BUILDING', ' BLDG');
        standardized = standardized.replace(' FLOOR', ' FL');

        // Standardize directional prefixes/suffixes
        standardized = standardized.replace(' NORTH ', ' N ');
        standardized = standardized.replace(' SOUTH ', ' S ');
        standardized = standardized.replace(' EAST ', ' E ');
        standardized = standardized.replace(' WEST ', ' W ');
        standardized = standardized.replace(' NORTHEAST ', ' NE ');
        standardized = standardized.replace(' NORTHWEST ', ' NW ');
        standardized = standardized.replace(' SOUTHEAST ', ' SE ');
        standardized = standardized.replace(' SOUTHWEST ', ' SW ');

        return standardized;
    }

    // ========================================================================
    // UTILITY: Convert to Proper Case
    // ========================================================================
    private static String toProperCase(String input) {
        if (input == null || input.length() == 0) return input;

        // Split on spaces and capitalize each word
        List<String> words = input.toLowerCase().split(' ');
        List<String> capitalizedWords = new List<String>();

        for (String word : words) {
            if (word.length() > 0) {
                String capitalized = word.substring(0, 1).toUpperCase();
                if (word.length() > 1) {
                    capitalized += word.substring(1);
                }
                capitalizedWords.add(capitalized);
            }
        }

        return String.join(capitalizedWords, ' ');
    }

    // ========================================================================
    // UTILITY: Standardize Country Code
    // ========================================================================
    private static Map<String, String> countryMap;

    private static String standardizeCountry(String country) {
        if (country == null) return null;

        // Initialize country mapping (cached)
        if (countryMap == null) {
            countryMap = new Map<String, String>{
                'UNITED STATES' => 'US',
                'USA' => 'US',
                'UNITED STATES OF AMERICA' => 'US',
                'U.S.A.' => 'US',
                'U.S.' => 'US',
                'CANADA' => 'CA',
                'UNITED KINGDOM' => 'GB',
                'UK' => 'GB',
                'GREAT BRITAIN' => 'GB',
                'ENGLAND' => 'GB',
                'SCOTLAND' => 'GB',
                'WALES' => 'GB',
                'NORTHERN IRELAND' => 'GB',
                'AUSTRALIA' => 'AU',
                'NEW ZEALAND' => 'NZ',
                'GERMANY' => 'DE',
                'FRANCE' => 'FR',
                'SPAIN' => 'ES',
                'ITALY' => 'IT',
                'JAPAN' => 'JP',
                'CHINA' => 'CN',
                'INDIA' => 'IN',
                'BRAZIL' => 'BR',
                'MEXICO' => 'MX',
                'NETHERLANDS' => 'NL',
                'BELGIUM' => 'BE',
                'SWITZERLAND' => 'CH',
                'SWEDEN' => 'SE',
                'NORWAY' => 'NO',
                'DENMARK' => 'DK',
                'FINLAND' => 'FI',
                'IRELAND' => 'IE',
                'PORTUGAL' => 'PT',
                'POLAND' => 'PL',
                'AUSTRIA' => 'AT',
                'GREECE' => 'GR'
            };
        }

        String normalized = country.trim().toUpperCase();

        // Check if already a 2-letter code
        if (normalized.length() == 2 &&
            countryMap.values().contains(normalized)) {
            return normalized;
        }

        // Map full name to code
        if (countryMap.containsKey(normalized)) {
            return countryMap.get(normalized);
        }

        // Return original if no mapping found
        return country.trim();
    }

    // ========================================================================
    // UTILITY: Standardize State/Province Code
    // ========================================================================
    private static Map<String, String> usStateMap;
    private static Map<String, String> canadaProvinceMap;

    private static String standardizeState(String state, String country) {
        if (state == null) return null;

        String normalized = state.trim().toUpperCase();
        String countryCode = standardizeCountry(country);

        // US States
        if (countryCode == 'US') {
            if (usStateMap == null) {
                usStateMap = buildUSStateMap();
            }

            // Already 2-letter code
            if (normalized.length() == 2 &&
                usStateMap.values().contains(normalized)) {
                return normalized;
            }

            // Map full name to code
            if (usStateMap.containsKey(normalized)) {
                return usStateMap.get(normalized);
            }
        }

        // Canadian Provinces
        if (countryCode == 'CA') {
            if (canadaProvinceMap == null) {
                canadaProvinceMap = buildCanadaProvinceMap();
            }

            if (normalized.length() == 2 &&
                canadaProvinceMap.values().contains(normalized)) {
                return normalized;
            }

            if (canadaProvinceMap.containsKey(normalized)) {
                return canadaProvinceMap.get(normalized);
            }
        }

        return state.trim();
    }

    private static Map<String, String> buildUSStateMap() {
        return new Map<String, String>{
            'ALABAMA' => 'AL', 'ALASKA' => 'AK', 'ARIZONA' => 'AZ',
            'ARKANSAS' => 'AR', 'CALIFORNIA' => 'CA', 'COLORADO' => 'CO',
            'CONNECTICUT' => 'CT', 'DELAWARE' => 'DE', 'FLORIDA' => 'FL',
            'GEORGIA' => 'GA', 'HAWAII' => 'HI', 'IDAHO' => 'ID',
            'ILLINOIS' => 'IL', 'INDIANA' => 'IN', 'IOWA' => 'IA',
            'KANSAS' => 'KS', 'KENTUCKY' => 'KY', 'LOUISIANA' => 'LA',
            'MAINE' => 'ME', 'MARYLAND' => 'MD', 'MASSACHUSETTS' => 'MA',
            'MICHIGAN' => 'MI', 'MINNESOTA' => 'MN', 'MISSISSIPPI' => 'MS',
            'MISSOURI' => 'MO', 'MONTANA' => 'MT', 'NEBRASKA' => 'NE',
            'NEVADA' => 'NV', 'NEW HAMPSHIRE' => 'NH', 'NEW JERSEY' => 'NJ',
            'NEW MEXICO' => 'NM', 'NEW YORK' => 'NY', 'NORTH CAROLINA' => 'NC',
            'NORTH DAKOTA' => 'ND', 'OHIO' => 'OH', 'OKLAHOMA' => 'OK',
            'OREGON' => 'OR', 'PENNSYLVANIA' => 'PA', 'RHODE ISLAND' => 'RI',
            'SOUTH CAROLINA' => 'SC', 'SOUTH DAKOTA' => 'SD', 'TENNESSEE' => 'TN',
            'TEXAS' => 'TX', 'UTAH' => 'UT', 'VERMONT' => 'VT',
            'VIRGINIA' => 'VA', 'WASHINGTON' => 'WA', 'WEST VIRGINIA' => 'WV',
            'WISCONSIN' => 'WI', 'WYOMING' => 'WY'
        };
    }

    private static Map<String, String> buildCanadaProvinceMap() {
        return new Map<String, String>{
            'ALBERTA' => 'AB', 'BRITISH COLUMBIA' => 'BC', 'MANITOBA' => 'MB',
            'NEW BRUNSWICK' => 'NB', 'NEWFOUNDLAND AND LABRADOR' => 'NL',
            'NORTHWEST TERRITORIES' => 'NT', 'NOVA SCOTIA' => 'NS',
            'NUNAVUT' => 'NU', 'ONTARIO' => 'ON', 'PRINCE EDWARD ISLAND' => 'PE',
            'QUEBEC' => 'QC', 'SASKATCHEWAN' => 'SK', 'YUKON' => 'YT'
        };
    }

    // ========================================================================
    // UTILITY: Standardize Postal Code
    // ========================================================================
    private static String standardizePostalCode(String postalCode, String country) {
        if (postalCode == null) return null;

        String standardized = postalCode.trim().toUpperCase();
        String countryCode = standardizeCountry(country);

        // US ZIP Code (12345 or 12345-6789)
        if (countryCode == 'US') {
            // Remove all non-digit/hyphen characters
            standardized = standardized.replaceAll('[^0-9-]', '');

            // Format as 12345 or 12345-6789
            if (standardized.length() == 5) {
                return standardized;
            } else if (standardized.length() == 9) {
                return standardized.substring(0, 5) + '-' +
                       standardized.substring(5, 9);
            } else if (standardized.contains('-') &&
                       standardized.length() == 10) {
                return standardized;
            }
        }

        // Canadian Postal Code (A1A 1A1)
        if (countryCode == 'CA') {
            // Remove all non-alphanumeric characters
            standardized = standardized.replaceAll('[^A-Z0-9]', '');

            // Format as A1A 1A1
            if (standardized.length() == 6) {
                return standardized.substring(0, 3) + ' ' +
                       standardized.substring(3, 6);
            }
        }

        // UK Postcode (variable format)
        if (countryCode == 'GB') {
            // Remove excess spaces
            standardized = standardized.replaceAll('\\s+', ' ').trim();

            // Ensure space before last 3 characters
            if (standardized.length() >= 5 && !standardized.contains(' ')) {
                Integer spacePosition = standardized.length() - 3;
                standardized = standardized.substring(0, spacePosition) + ' ' +
                               standardized.substring(spacePosition);
            }
        }

        return standardized;
    }

    // ========================================================================
    // UTILITY: Build Standardized Full Address
    // ========================================================================
    private static String buildStandardizedAddress(String street, String city,
                                                   String state, String postalCode,
                                                   String country) {
        List<String> parts = new List<String>();

        if (street != null && street.length() > 0) {
            parts.add(street);
        }
        if (city != null && city.length() > 0) {
            parts.add(city);
        }
        if (state != null && state.length() > 0) {
            parts.add(state);
        }
        if (postalCode != null && postalCode.length() > 0) {
            parts.add(postalCode);
        }
        if (country != null && country.length() > 0) {
            parts.add(country);
        }

        return String.join(parts, ', ');
    }

    // ========================================================================
    // UTILITY: Validate Address Format
    // ========================================================================
    private static String validateAddress(String street, String city,
                                          String state, String postalCode,
                                          String country) {
        String countryCode = standardizeCountry(country);

        // US Address Validation
        if (countryCode == 'US') {
            if (postalCode != null) {
                if (!Pattern.matches('\\d{5}(-\\d{4})?', postalCode)) {
                    return 'Invalid US ZIP code format (expected 12345 or 12345-6789)';
                }
            }

            if (state != null && state.length() == 2) {
                if (usStateMap == null) usStateMap = buildUSStateMap();
                if (!usStateMap.values().contains(state.toUpperCase())) {
                    return 'Invalid US state code: ' + state;
                }
            }
        }

        // Canadian Address Validation
        if (countryCode == 'CA') {
            if (postalCode != null) {
                if (!Pattern.matches('[A-Z]\\d[A-Z] \\d[A-Z]\\d', postalCode)) {
                    return 'Invalid Canadian postal code format (expected A1A 1A1)';
                }
            }

            if (state != null && state.length() == 2) {
                if (canadaProvinceMap == null) {
                    canadaProvinceMap = buildCanadaProvinceMap();
                }
                if (!canadaProvinceMap.values().contains(state.toUpperCase())) {
                    return 'Invalid Canadian province code: ' + state;
                }
            }
        }

        // UK Postcode Validation (simplified)
        if (countryCode == 'GB') {
            if (postalCode != null) {
                if (!Pattern.matches('[A-Z]{1,2}\\d{1,2}[A-Z]? \\d[A-Z]{2}',
                                    postalCode)) {
                    return 'Invalid UK postcode format';
                }
            }
        }

        return null; // Valid
    }

    // ========================================================================
    // CHANGE DETECTION HELPERS
    // ========================================================================
    private static Boolean hasBillingAddressChanged(ObjectName newRecord,
                                                    ObjectName oldRecord) {
        return newRecord.BillingStreet != oldRecord.BillingStreet
            || newRecord.BillingCity != oldRecord.BillingCity
            || newRecord.BillingState != oldRecord.BillingState
            || newRecord.BillingPostalCode != oldRecord.BillingPostalCode
            || newRecord.BillingCountry != oldRecord.BillingCountry;
    }

    private static Boolean hasShippingAddressChanged(ObjectName newRecord,
                                                     ObjectName oldRecord) {
        return newRecord.ShippingStreet != oldRecord.ShippingStreet
            || newRecord.ShippingCity != oldRecord.ShippingCity
            || newRecord.ShippingState != oldRecord.ShippingState
            || newRecord.ShippingPostalCode != oldRecord.ShippingPostalCode
            || newRecord.ShippingCountry != oldRecord.ShippingCountry;
    }

    private static Boolean hasMailingAddressChanged(ObjectName newRecord,
                                                    ObjectName oldRecord) {
        return newRecord.MailingStreet__c != oldRecord.MailingStreet__c
            || newRecord.MailingCity__c != oldRecord.MailingCity__c
            || newRecord.MailingState__c != oldRecord.MailingState__c
            || newRecord.MailingPostalCode__c != oldRecord.MailingPostalCode__c
            || newRecord.MailingCountry__c != oldRecord.MailingCountry__c;
    }
}

// ============================================================================
// TEST CLASS: ObjectNameTriggerHandlerTest.cls
// ============================================================================
@isTest
private class ObjectNameTriggerHandlerTest {

    // ========================================================================
    // TEST: US Address Standardization
    // ========================================================================
    @isTest
    static void testUSAddressStandardization() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'US Test',
            BillingStreet = '123 main street apt 4b',
            BillingCity = 'san francisco',
            BillingState = 'California',
            BillingPostalCode = '94102',
            BillingCountry = 'United States'
        );

        insert record;

        record = [SELECT Id, BillingStreet, BillingCity, BillingState,
                         BillingPostalCode, BillingCountry,
                         BillingAddressStandardized__c,
                         BillingAddressValidation__c
                  FROM ObjectName WHERE Id = :record.Id];

        // Verify standardization
        System.assertEquals('123 MAIN ST APT 4B', record.BillingStreet,
            'Street should be uppercase with abbreviations');

        System.assertEquals('San Francisco', record.BillingCity,
            'City should be proper case');

        System.assertEquals('CA', record.BillingState,
            'State should be 2-letter code');

        System.assertEquals('94102', record.BillingPostalCode,
            'ZIP should remain 5 digits');

        System.assertEquals('US', record.BillingCountry,
            'Country should be 2-letter code');

        System.assertNotEquals(null, record.BillingAddressStandardized__c,
            'Standardized address should be built');

        System.assertEquals('Valid', record.BillingAddressValidation__c,
            'Address should be valid');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Canadian Address Standardization
    // ========================================================================
    @isTest
    static void testCanadianAddressStandardization() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Canada Test',
            ShippingStreet = '100 Queen Street West',
            ShippingCity = 'toronto',
            ShippingState = 'Ontario',
            ShippingPostalCode = 'M5H2N2',
            ShippingCountry = 'Canada'
        );

        insert record;

        record = [SELECT Id, ShippingStreet, ShippingCity, ShippingState,
                         ShippingPostalCode, ShippingCountry,
                         ShippingAddressValidation__c
                  FROM ObjectName WHERE Id = :record.Id];

        System.assertEquals('100 QUEEN ST W', record.ShippingStreet,
            'Street should be uppercase with abbreviations');

        System.assertEquals('Toronto', record.ShippingCity,
            'City should be proper case');

        System.assertEquals('ON', record.ShippingState,
            'Province should be 2-letter code');

        System.assertEquals('M5H 2N2', record.ShippingPostalCode,
            'Postal code should have space');

        System.assertEquals('CA', record.ShippingCountry,
            'Country should be CA');

        System.assertEquals('Valid', record.ShippingAddressValidation__c,
            'Address should be valid');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: UK Address Standardization
    // ========================================================================
    @isTest
    static void testUKAddressStandardization() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'UK Test',
            BillingStreet = '10 Downing Street',
            BillingCity = 'london',
            BillingPostalCode = 'SW1A2AA',
            BillingCountry = 'United Kingdom'
        );

        insert record;

        record = [SELECT Id, BillingStreet, BillingCity, BillingPostalCode,
                         BillingCountry
                  FROM ObjectName WHERE Id = :record.Id];

        System.assertEquals('10 DOWNING ST', record.BillingStreet);
        System.assertEquals('London', record.BillingCity);
        System.assertEquals('SW1A 2AA', record.BillingPostalCode,
            'UK postcode should have space');
        System.assertEquals('GB', record.BillingCountry);

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Update Restandardization
    // ========================================================================
    @isTest
    static void testUpdateRestandardization() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Update Test',
            BillingStreet = '123 Main St',
            BillingCity = 'New York',
            BillingState = 'NY',
            BillingCountry = 'US'
        );

        insert record;

        // Update address
        record.BillingStreet = '456 broadway avenue';
        record.BillingState = 'New York';
        update record;

        record = [SELECT Id, BillingStreet, BillingState
                  FROM ObjectName WHERE Id = :record.Id];

        System.assertEquals('456 BROADWAY AVE', record.BillingStreet,
            'Updated street should be standardized');

        System.assertEquals('NY', record.BillingState,
            'Updated state should be standardized');

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
                BillingStreet = i + ' main street',
                BillingCity = 'san francisco',
                BillingState = 'California',
                BillingPostalCode = '94102',
                BillingCountry = 'USA'
            ));
        }

        insert records;

        List<ObjectName> inserted = [SELECT Id, BillingState, BillingCountry
                                      FROM ObjectName
                                      WHERE Name LIKE 'Bulk Test%'];

        System.assertEquals(200, inserted.size());

        for (ObjectName record : inserted) {
            System.assertEquals('CA', record.BillingState,
                'All states should be standardized to CA');
            System.assertEquals('US', record.BillingCountry,
                'All countries should be standardized to US');
        }

        // Verify governor limits
        System.assert(Limits.getQueries() < 3,
            'Should use < 3 SOQL queries');

        Test.stopTest();
    }

    // ========================================================================
    // TEST: Invalid Address Detection
    // ========================================================================
    @isTest
    static void testInvalidAddressDetection() {
        Test.startTest();

        ObjectName record = new ObjectName(
            Name = 'Invalid Test',
            BillingStreet = '123 Main St',
            BillingCity = 'New York',
            BillingState = 'ZZ', // Invalid state
            BillingPostalCode = '123', // Invalid ZIP
            BillingCountry = 'US'
        );

        insert record;

        record = [SELECT Id, BillingAddressValidation__c
                  FROM ObjectName WHERE Id = :record.Id];

        System.assertNotEquals('Valid', record.BillingAddressValidation__c,
            'Should detect invalid address');

        System.assert(record.BillingAddressValidation__c.contains('ZIP'),
            'Should mention ZIP code issue');

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
            // All address fields null
        );

        insert record;

        System.assert(true, 'Should not throw NPE with null addresses');

        Test.stopTest();
    }
}
