// Comprehensive Contact Marking Script
// This script marks contacts based on sync status with HubSpot

System.debug('Starting comprehensive contact marking...');

// 1. Mark contacts that are in both systems but NOT on Inclusion List
// These are the critical ones we identified from the overlap analysis
Set<Id> contactsInBothNotSynced = new Set<Id>{
    '0032A00002RHA6DQAX', // Kim kisilewicz
    '0032A00002SFDkbQAH', // Casey Board
    '0032A00002SFDmXQAX', // Allison Crawford
    // From original analysis (first 20 of 825)
    '0033j000049EmCEAA0',
    '0033j00003wOrqsAAC',
    '0032A00002azoD7QAI',
    '0033j00003wP0NPAA0',
    '0032A00002az12kQAA',
    '0033j00003wOu2KAAS',
    '0033j000041CALcAAO',
    '0033j000049CmF3AAK',
    '0032A00002az2lyQAA',
    '0033j000049E3RxAAK'
};

List<Contact> contactsToUpdate = new List<Contact>();

// Update contacts that are in both systems but not synced
for (Id contactId : contactsInBothNotSynced) {
    Contact c = new Contact(Id = contactId);
    c.Sync_Status__c = 'In HS Not on Inclusion List';
    c.In_HubSpot_Not_Inclusion_List__c = true;
    c.Clean_Status__c = 'Review';
    contactsToUpdate.add(c);
}

// Execute the update
if (!contactsToUpdate.isEmpty()) {
    Database.SaveResult[] results = Database.update(contactsToUpdate, false);

    Integer successCount = 0;
    Integer errorCount = 0;

    for (Database.SaveResult sr : results) {
        if (sr.isSuccess()) {
            successCount++;
        } else {
            errorCount++;
            for (Database.Error err : sr.getErrors()) {
                System.debug('Error updating contact: ' + err.getMessage());
            }
        }
    }

    System.debug('✅ Successfully updated ' + successCount + ' contacts');
    System.debug('❌ Failed to update ' + errorCount + ' contacts');
}

// 2. Now let's analyze a larger batch to find more contacts needing marking
System.debug('Analyzing contacts for quality and sync status...');

// Get contacts with emails to check for duplicates and quality
List<Contact> emailContacts = [
    SELECT Id, Email, Name, Phone, MobilePhone, AccountId,
           LeadSource, LastActivityDate, CreatedDate,
           Clean_Status__c, Sync_Status__c
    FROM Contact
    WHERE Email != null
      AND Clean_Status__c = null
    LIMIT 500
];

// Map to track duplicates
Map<String, List<Contact>> emailToContacts = new Map<String, List<Contact>>();

// Build duplicate map and assess quality
Integer lowQualityCount = 0;
Integer duplicateCount = 0;
List<Contact> contactsToScore = new List<Contact>();

for (Contact c : emailContacts) {
    // Track duplicates
    String emailKey = c.Email.toLowerCase();
    if (!emailToContacts.containsKey(emailKey)) {
        emailToContacts.put(emailKey, new List<Contact>());
    }
    emailToContacts.get(emailKey).add(c);

    // Calculate quality score
    Integer score = 0;
    if (c.Email != null) score += 30;
    if (c.Phone != null || c.MobilePhone != null) score += 20;
    if (c.Name != null && c.Name != 'Unknown') score += 20;
    if (c.LeadSource != null) score += 10;
    if (c.AccountId != null) score += 10;
    if (c.LastActivityDate != null) {
        Integer daysSinceActivity = Date.today().daysBetween(c.LastActivityDate);
        if (daysSinceActivity < 90 && daysSinceActivity > -90) score += 10;
    }

    // Mark based on quality
    Contact updateContact = new Contact(Id = c.Id);
    // Data_Quality_Score__c field not available yet, skip for now

    if (score < 40) {
        updateContact.Clean_Status__c = 'Delete';
        // Delete_Reason__c field not available yet
        lowQualityCount++;
    } else if (score < 70) {
        updateContact.Clean_Status__c = 'Review';
    } else {
        updateContact.Clean_Status__c = 'OK';
    }

    contactsToScore.add(updateContact);
}

// Mark duplicates
List<Contact> duplicatesToMark = new List<Contact>();
for (String email : emailToContacts.keySet()) {
    List<Contact> dupes = emailToContacts.get(email);
    if (dupes.size() > 1) {
        duplicateCount += dupes.size();

        // Sort by last activity to keep the most recent
        dupes.sort();

        // Mark all but the first as potential merges
        for (Integer i = 1; i < dupes.size(); i++) {
            Contact c = new Contact(Id = dupes[i].Id);
            c.Clean_Status__c = 'Merge';

            // Store the primary contact ID in Merge_Candidates
            c.Merge_Candidates__c = dupes[0].Id;
            duplicatesToMark.add(c);
        }
    }
}

// Update contacts with scores
if (!contactsToScore.isEmpty()) {
    Database.SaveResult[] scoreResults = Database.update(contactsToScore, false);
    System.debug('✅ Scored ' + contactsToScore.size() + ' contacts');
}

// Update duplicates
if (!duplicatesToMark.isEmpty()) {
    Database.SaveResult[] dupeResults = Database.update(duplicatesToMark, false);
    System.debug('✅ Marked ' + duplicatesToMark.size() + ' duplicate contacts for merge');
}

// 3. Summary statistics
System.debug('=== MARKING SUMMARY ===');
System.debug('Contacts marked as "In HS Not on Inclusion List": ' + contactsInBothNotSynced.size());
System.debug('Contacts scored for quality: ' + contactsToScore.size());
System.debug('Low quality contacts marked for deletion: ' + lowQualityCount);
System.debug('Duplicate contacts marked for merge: ' + duplicateCount);

// Query to show current status
AggregateResult[] cleanStatusCounts = [
    SELECT Clean_Status__c status, COUNT(Id) cnt
    FROM Contact
    WHERE Clean_Status__c != null
    GROUP BY Clean_Status__c
];

System.debug('=== CURRENT CLEAN STATUS DISTRIBUTION ===');
for (AggregateResult ar : cleanStatusCounts) {
    System.debug(ar.get('status') + ': ' + ar.get('cnt'));
}

AggregateResult[] syncStatusCounts = [
    SELECT Sync_Status__c status, COUNT(Id) cnt
    FROM Contact
    WHERE Sync_Status__c != null
    GROUP BY Sync_Status__c
];

System.debug('=== CURRENT SYNC STATUS DISTRIBUTION ===');
for (AggregateResult ar : syncStatusCounts) {
    System.debug(ar.get('status') + ': ' + ar.get('cnt'));
}

System.debug('✨ Contact marking complete!');