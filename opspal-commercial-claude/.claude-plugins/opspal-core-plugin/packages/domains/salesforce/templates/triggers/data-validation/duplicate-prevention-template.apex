/**
 * @description Prevent duplicate records based on unique fields
 * @usage Custom duplicate detection logic
 * @complexity Medium
 * @bestPractices Handler pattern, before trigger, case-insensitive comparison
 *
 * USE CASE EXAMPLES:
 * - Prevent duplicate Accounts by name + domain
 * - Prevent duplicate Contacts by email
 * - Prevent duplicate Products by SKU
 * - Prevent duplicate Leads by email + company
 * - Fuzzy matching (similar names)
 * - Composite key uniqueness
 *
 * WHY USE TRIGGER INSTEAD OF DUPLICATE RULES:
 * - Complex matching logic (fuzzy matching, soundex)
 * - Composite key uniqueness (multiple fields)
 * - Case-insensitive matching
 * - Custom error messages with duplicate details
 * - Need to query across multiple objects
 * - Conditional duplicate logic
 *
 * PERFORMANCE CONSIDERATIONS:
 * - Query existing records ONCE (outside loop)
 * - Use Set for O(1) lookups
 * - Build normalized keys for comparison
 * - Limit query to potential duplicates only
 * - Use indexed fields in WHERE clause
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your object (e.g., Account, Contact)
 * [ ] Define uniqueness criteria (fields that determine duplicates)
 * [ ] Decide on case-sensitivity and trimming
 * [ ] Implement fuzzy matching if needed
 * [ ] Test with 200 records to verify bulkification
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
 * - Build unique keys for O(1) duplicate detection
 * - Query existing records ONCE (outside loop)
 * - Provide clear error messages with duplicate details
 * - Consider case-insensitivity and trimming
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

        // Call duplicate detection methods
        preventDuplicatesByEmail(newRecords, oldMap, isInsert);
        preventDuplicatesByCompositeKey(newRecords, oldMap, isInsert);
        preventDuplicatesInBatch(newRecords);

        isExecuting = false;
    }

    // ========================================
    // DUPLICATE DETECTION BY SINGLE FIELD (EMAIL)
    // ========================================

    private static void preventDuplicatesByEmail(List<ObjectName> newRecords,
                                                  Map<Id, ObjectName> oldMap,
                                                  Boolean isInsert) {
        // Step 1: Build set of emails to check (normalize: lowercase, trim)
        Set<String> emailsToCheck = new Set<String>();
        Map<String, ObjectName> recordsByEmail = new Map<String, ObjectName>();

        for (ObjectName record : newRecords) {
            if (record.Email__c != null) {
                // Normalize email (lowercase, trim)
                String normalizedEmail = record.Email__c.toLowerCase().trim();

                // Only check if email changed (on update) or is new (on insert)
                Boolean emailChanged = false;
                if (isInsert) {
                    emailChanged = true;
                } else {
                    ObjectName oldRecord = oldMap.get(record.Id);
                    emailChanged = (record.Email__c != oldRecord.Email__c);
                }

                if (emailChanged) {
                    emailsToCheck.add(normalizedEmail);
                    recordsByEmail.put(normalizedEmail, record);
                }
            }
        }

        if (emailsToCheck.isEmpty()) return;

        // Step 2: Query existing records with these emails (SINGLE query)
        // Exclude current record IDs (on update)
        Set<Id> currentRecordIds = new Set<Id>();
        if (!isInsert) {
            currentRecordIds = oldMap.keySet();
        }

        Map<String, ObjectName> existingRecordsByEmail = new Map<String, ObjectName>();
        for (ObjectName existing : [
            SELECT Id, Name, Email__c
            FROM ObjectName
            WHERE Email__c IN :emailsToCheck
              AND Id NOT IN :currentRecordIds
        ]) {
            String normalizedEmail = existing.Email__c.toLowerCase().trim();
            existingRecordsByEmail.put(normalizedEmail, existing);
        }

        // Step 3: Check for duplicates
        for (String email : emailsToCheck) {
            if (existingRecordsByEmail.containsKey(email)) {
                ObjectName duplicate = existingRecordsByEmail.get(email);
                ObjectName record = recordsByEmail.get(email);

                record.Email__c.addError(
                    'Email already exists on record: ' + duplicate.Name +
                    ' (' + duplicate.Id + ')'
                );
            }
        }
    }

    // ========================================
    // DUPLICATE DETECTION BY COMPOSITE KEY
    // ========================================

    private static void preventDuplicatesByCompositeKey(List<ObjectName> newRecords,
                                                         Map<Id, ObjectName> oldMap,
                                                         Boolean isInsert) {
        // Composite key: Name + Domain (for Accounts) or Email + Company (for Leads)

        // Step 1: Build composite keys
        Set<String> keysToCheck = new Set<String>();
        Map<String, ObjectName> recordsByKey = new Map<String, ObjectName>();

        for (ObjectName record : newRecords) {
            if (record.Name != null && record.Domain__c != null) {
                // Build composite key (normalized)
                String key = buildCompositeKey(record.Name, record.Domain__c);

                // Only check if key changed (on update) or is new (on insert)
                Boolean keyChanged = false;
                if (isInsert) {
                    keyChanged = true;
                } else {
                    ObjectName oldRecord = oldMap.get(record.Id);
                    String oldKey = buildCompositeKey(oldRecord.Name, oldRecord.Domain__c);
                    keyChanged = (key != oldKey);
                }

                if (keyChanged) {
                    keysToCheck.add(key);
                    recordsByKey.put(key, record);
                }
            }
        }

        if (keysToCheck.isEmpty()) return;

        // Step 2: Query existing records with these keys (SINGLE query)
        Set<Id> currentRecordIds = new Set<Id>();
        if (!isInsert) {
            currentRecordIds = oldMap.keySet();
        }

        // Query all records and build keys in memory (more efficient than complex WHERE)
        Map<String, ObjectName> existingRecordsByKey = new Map<String, ObjectName>();
        for (ObjectName existing : [
            SELECT Id, Name, Domain__c
            FROM ObjectName
            WHERE Name != null
              AND Domain__c != null
              AND Id NOT IN :currentRecordIds
        ]) {
            String key = buildCompositeKey(existing.Name, existing.Domain__c);
            if (keysToCheck.contains(key)) {
                existingRecordsByKey.put(key, existing);
            }
        }

        // Step 3: Check for duplicates
        for (String key : keysToCheck) {
            if (existingRecordsByKey.containsKey(key)) {
                ObjectName duplicate = existingRecordsByKey.get(key);
                ObjectName record = recordsByKey.get(key);

                record.addError(
                    'Duplicate record found: ' + duplicate.Name +
                    ' (' + duplicate.Id + ') has the same Name + Domain'
                );
            }
        }
    }

    // ========================================
    // PREVENT DUPLICATES WITHIN BATCH
    // ========================================

    private static void preventDuplicatesInBatch(List<ObjectName> records) {
        // Prevent duplicates within the same batch (e.g., importing 200 records with duplicates)

        Map<String, ObjectName> seenEmails = new Map<String, ObjectName>();
        Map<String, ObjectName> seenCompositeKeys = new Map<String, ObjectName>();

        for (ObjectName record : records) {
            // Check email duplicates within batch
            if (record.Email__c != null) {
                String normalizedEmail = record.Email__c.toLowerCase().trim();

                if (seenEmails.containsKey(normalizedEmail)) {
                    ObjectName firstRecord = seenEmails.get(normalizedEmail);
                    record.Email__c.addError(
                        'Duplicate email within this batch. First occurrence: ' + firstRecord.Name
                    );
                } else {
                    seenEmails.put(normalizedEmail, record);
                }
            }

            // Check composite key duplicates within batch
            if (record.Name != null && record.Domain__c != null) {
                String key = buildCompositeKey(record.Name, record.Domain__c);

                if (seenCompositeKeys.containsKey(key)) {
                    ObjectName firstRecord = seenCompositeKeys.get(key);
                    record.addError(
                        'Duplicate Name + Domain within this batch. First occurrence: ' + firstRecord.Name
                    );
                } else {
                    seenCompositeKeys.put(key, record);
                }
            }
        }
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    private static String buildCompositeKey(String name, String domain) {
        // Normalize and combine fields
        String normalizedName = name.toLowerCase().trim();
        String normalizedDomain = domain.toLowerCase().trim();
        return normalizedName + '|' + normalizedDomain;
    }

    // Advanced: Fuzzy matching (example using Levenshtein distance)
    private static Boolean isFuzzyMatch(String str1, String str2, Integer threshold) {
        Integer distance = calculateLevenshteinDistance(str1, str2);
        return distance <= threshold;
    }

    private static Integer calculateLevenshteinDistance(String str1, String str2) {
        // Simple Levenshtein distance implementation
        // (Simplified for demonstration - use library in production)
        if (str1 == null || str2 == null) return 999;
        if (str1 == str2) return 0;

        Integer len1 = str1.length();
        Integer len2 = str2.length();

        List<List<Integer>> matrix = new List<List<Integer>>();
        for (Integer i = 0; i <= len1; i++) {
            List<Integer> row = new List<Integer>();
            for (Integer j = 0; j <= len2; j++) {
                row.add(0);
            }
            matrix.add(row);
        }

        for (Integer i = 0; i <= len1; i++) {
            matrix[i][0] = i;
        }
        for (Integer j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

        for (Integer i = 1; i <= len1; i++) {
            for (Integer j = 1; j <= len2; j++) {
                Integer cost = (str1.charAt(i - 1) == str2.charAt(j - 1)) ? 0 : 1;
                matrix[i][j] = Math.min(
                    Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1),
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[len1][len2];
    }
}
*/

/**
 * REAL-WORLD EXAMPLE: Contact Duplicate Prevention
 *
 * Scenario: Prevent duplicate Contacts by Email
 */
/*
trigger ContactTrigger on Contact (before insert, before update) {
    ContactDuplicateHandler.handleBeforeInsertUpdate(Trigger.new, Trigger.oldMap);
}

public class ContactDuplicateHandler {

    private static Boolean isExecuting = false;

    public static void handleBeforeInsertUpdate(List<Contact> newContacts,
                                                 Map<Id, Contact> oldMap) {
        if (isExecuting) return;
        isExecuting = true;

        Boolean isInsert = (oldMap == null);

        preventDuplicatesByEmail(newContacts, oldMap, isInsert);
        preventDuplicatesInBatch(newContacts);

        isExecuting = false;
    }

    private static void preventDuplicatesByEmail(List<Contact> newContacts,
                                                  Map<Id, Contact> oldMap,
                                                  Boolean isInsert) {
        // Step 1: Build set of emails to check
        Set<String> emailsToCheck = new Set<String>();
        Map<String, Contact> contactsByEmail = new Map<String, Contact>();

        for (Contact con : newContacts) {
            if (con.Email != null) {
                String normalizedEmail = con.Email.toLowerCase().trim();

                Boolean emailChanged = false;
                if (isInsert) {
                    emailChanged = true;
                } else {
                    Contact oldCon = oldMap.get(con.Id);
                    emailChanged = (con.Email != oldCon.Email);
                }

                if (emailChanged) {
                    emailsToCheck.add(normalizedEmail);
                    contactsByEmail.put(normalizedEmail, con);
                }
            }
        }

        if (emailsToCheck.isEmpty()) return;

        // Step 2: Query existing contacts
        Set<Id> currentContactIds = new Set<Id>();
        if (!isInsert) {
            currentContactIds = oldMap.keySet();
        }

        Map<String, Contact> existingContactsByEmail = new Map<String, Contact>();
        for (Contact existing : [
            SELECT Id, Name, Email, Account.Name
            FROM Contact
            WHERE Email IN :emailsToCheck
              AND Id NOT IN :currentContactIds
        ]) {
            String normalizedEmail = existing.Email.toLowerCase().trim();
            existingContactsByEmail.put(normalizedEmail, existing);
        }

        // Step 3: Check for duplicates
        for (String email : emailsToCheck) {
            if (existingContactsByEmail.containsKey(email)) {
                Contact duplicate = existingContactsByEmail.get(email);
                Contact con = contactsByEmail.get(email);

                String accountInfo = (duplicate.Account != null) ?
                    ' at ' + duplicate.Account.Name : '';

                con.Email.addError(
                    'Email already exists: ' + duplicate.Name + accountInfo +
                    ' (' + duplicate.Id + ')'
                );
            }
        }
    }

    private static void preventDuplicatesInBatch(List<Contact> contacts) {
        Map<String, Contact> seenEmails = new Map<String, Contact>();

        for (Contact con : contacts) {
            if (con.Email != null) {
                String normalizedEmail = con.Email.toLowerCase().trim();

                if (seenEmails.containsKey(normalizedEmail)) {
                    Contact firstContact = seenEmails.get(normalizedEmail);
                    con.Email.addError(
                        'Duplicate email within this batch. First occurrence: ' +
                        firstContact.FirstName + ' ' + firstContact.LastName
                    );
                } else {
                    seenEmails.put(normalizedEmail, con);
                }
            }
        }
    }
}
*/

/**
 * REAL-WORLD EXAMPLE: Account Duplicate Prevention with Fuzzy Matching
 *
 * Scenario: Prevent similar Account names (typos, variations)
 */
/*
public static void preventSimilarAccounts(List<Account> newAccounts) {
    // Build set of names to check
    Set<String> namesToCheck = new Set<String>();
    Map<String, Account> accountsByName = new Map<String, Account>();

    for (Account acc : newAccounts) {
        if (acc.Name != null) {
            String normalizedName = acc.Name.toLowerCase().trim();
            namesToCheck.add(normalizedName);
            accountsByName.put(normalizedName, acc);
        }
    }

    if (namesToCheck.isEmpty()) return;

    // Query existing accounts with similar names
    List<Account> existingAccounts = [
        SELECT Id, Name
        FROM Account
        WHERE Name != null
        LIMIT 10000  // Safety limit
    ];

    // Check for fuzzy matches
    for (String name : namesToCheck) {
        for (Account existing : existingAccounts) {
            String existingName = existing.Name.toLowerCase().trim();

            // Skip exact duplicates (handled by standard duplicate rules)
            if (name == existingName) continue;

            // Check Levenshtein distance (threshold: 3)
            if (isFuzzyMatch(name, existingName, 3)) {
                Account acc = accountsByName.get(name);
                acc.Name.addError(
                    'Similar account name exists: ' + existing.Name +
                    ' (' + existing.Id + '). This might be a duplicate.'
                );
                break;  // Only flag first match
            }
        }
    }
}
*/

/**
 * TEST CLASS TEMPLATE
 *
 * TESTING CHECKLIST:
 * [ ] Test exact duplicate detection
 * [ ] Test case-insensitive matching
 * [ ] Test with leading/trailing spaces
 * [ ] Test update changing to duplicate value
 * [ ] Test update NOT changing value (should not validate)
 * [ ] Test duplicates within same batch
 * [ ] Test bulk (200 records) - verify <10 SOQL queries
 * [ ] Verify error messages are clear
 */
/*
@isTest
private class ObjectNameTriggerHandlerTest {

    // ========================================
    // EXACT DUPLICATE TEST
    // ========================================

    @isTest
    static void testInsert_ExactDuplicate() {
        // Insert first record
        ObjectName record1 = new ObjectName(
            Name = 'Test Record',
            Email__c = 'test@example.com'
        );
        insert record1;

        // Try to insert duplicate
        ObjectName record2 = new ObjectName(
            Name = 'Test Record 2',
            Email__c = 'test@example.com'  // Duplicate email
        );

        Test.startTest();
        try {
            insert record2;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('already exists'),
                'Error should mention duplicate exists');
        }
        Test.stopTest();
    }

    // ========================================
    // CASE-INSENSITIVE TEST
    // ========================================

    @isTest
    static void testInsert_CaseInsensitive() {
        ObjectName record1 = new ObjectName(
            Name = 'Test Record',
            Email__c = 'Test@Example.com'  // Mixed case
        );
        insert record1;

        ObjectName record2 = new ObjectName(
            Name = 'Test Record 2',
            Email__c = 'test@example.com'  // Different case, same email
        );

        Test.startTest();
        try {
            insert record2;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('already exists'),
                'Should detect duplicate despite different case');
        }
        Test.stopTest();
    }

    // ========================================
    // WHITESPACE TEST
    // ========================================

    @isTest
    static void testInsert_WithWhitespace() {
        ObjectName record1 = new ObjectName(
            Name = 'Test Record',
            Email__c = ' test@example.com '  // With spaces
        );
        insert record1;

        ObjectName record2 = new ObjectName(
            Name = 'Test Record 2',
            Email__c = 'test@example.com'  // Without spaces
        );

        Test.startTest();
        try {
            insert record2;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('already exists'),
                'Should detect duplicate after trimming spaces');
        }
        Test.stopTest();
    }

    // ========================================
    // UPDATE TO DUPLICATE TEST
    // ========================================

    @isTest
    static void testUpdate_ChangeToDuplicate() {
        ObjectName record1 = new ObjectName(
            Name = 'Test Record 1',
            Email__c = 'test1@example.com'
        );
        ObjectName record2 = new ObjectName(
            Name = 'Test Record 2',
            Email__c = 'test2@example.com'
        );
        insert new List<ObjectName>{record1, record2};

        // Change record2's email to match record1 (duplicate)
        record2.Email__c = 'test1@example.com';

        Test.startTest();
        try {
            update record2;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('already exists'),
                'Should detect duplicate when updating');
        }
        Test.stopTest();
    }

    // ========================================
    // UPDATE WITHOUT CHANGE TEST
    // ========================================

    @isTest
    static void testUpdate_NoEmailChange() {
        ObjectName record = new ObjectName(
            Name = 'Test Record',
            Email__c = 'test@example.com'
        );
        insert record;

        // Update different field (not email)
        record.Name = 'Updated Name';

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        update record;  // Should succeed without duplicate check
        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Test.stopTest();

        ObjectName updated = [SELECT Name FROM ObjectName WHERE Id = :record.Id];
        System.assertEquals('Updated Name', updated.Name, 'Update should succeed');
        System.assert(queriesUsed < 5,
            'Should not query for duplicates when email not changed');
    }

    // ========================================
    // BATCH DUPLICATES TEST
    // ========================================

    @isTest
    static void testInsert_DuplicatesWithinBatch() {
        List<ObjectName> records = new List<ObjectName>();
        records.add(new ObjectName(
            Name = 'Record 1',
            Email__c = 'test@example.com'
        ));
        records.add(new ObjectName(
            Name = 'Record 2',
            Email__c = 'test@example.com'  // Duplicate within batch
        ));

        Test.startTest();
        try {
            insert records;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('Duplicate'),
                'Should detect duplicates within same batch');
        }
        Test.stopTest();
    }

    // ========================================
    // BULK TEST
    // ========================================

    @isTest
    static void testInsert_BulkUniqueRecords() {
        List<ObjectName> records = new List<ObjectName>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ObjectName(
                Name = 'Test Record ' + i,
                Email__c = 'test' + i + '@example.com'  // All unique
            ));
        }

        Test.startTest();
        Integer queriesBefore = Limits.getQueries();
        insert records;
        Integer queriesUsed = Limits.getQueries() - queriesBefore;
        Test.stopTest();

        List<ObjectName> inserted = [SELECT Id FROM ObjectName];
        System.assertEquals(200, inserted.size(), 'All 200 unique records should be inserted');
        System.assert(queriesUsed < 10,
            'Should use <10 SOQL queries. Used: ' + queriesUsed);
    }

    // ========================================
    // COMPOSITE KEY TEST
    // ========================================

    @isTest
    static void testInsert_CompositeKeyDuplicate() {
        ObjectName record1 = new ObjectName(
            Name = 'Acme Corp',
            Domain__c = 'acme.com'
        );
        insert record1;

        ObjectName record2 = new ObjectName(
            Name = 'Acme Corp',  // Same name
            Domain__c = 'acme.com'  // Same domain
        );

        Test.startTest();
        try {
            insert record2;
            System.assert(false, 'Should have thrown validation error');
        } catch (DmlException e) {
            System.assert(e.getMessage().contains('same Name + Domain'),
                'Should detect composite key duplicate');
        }
        Test.stopTest();
    }
}
*/
