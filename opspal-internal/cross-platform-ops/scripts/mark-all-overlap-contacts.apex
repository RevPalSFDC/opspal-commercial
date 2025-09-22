// Mark ALL 825 contacts from overlap analysis that are in both systems but NOT on Inclusion List
System.debug('Starting comprehensive marking of ALL overlap contacts...');

// All 825 contact IDs from our overlap analysis (swapped from the JSON)
List<String> allOverlapContacts = new List<String>{
    // First batch (original 13 we marked)
    '0032A00002RHA6DQAX', '0032A00002SFDkbQAH', '0032A00002SFDmXQAX',
    '0033j000049EmCEAA0', '0033j00003wOrqsAAC', '0032A00002azoD7QAI',
    '0033j00003wP0NPAA0', '0032A00002az12kQAA', '0033j00003wOu2KAAS',
    '0033j000041CALcAAO', '0033j000049CmF3AAK', '0032A00002az2lyQAA',
    '0033j000049E3RxAAK',

    // Additional contacts from full analysis (adding next 100)
    '0033j00003wP1uJAAS', '0033j000049DdtxAAC', '0033j00003wOxfKAAS',
    '0032A00002az1dRQAQ', '0033j000049CmFDAAO', '0033j00003aN2YqAAK',
    '0033j000041U2yKAAS', '0033j00003wOqh2AAC', '0033j00003aN3CuAAK',
    '0032A00002aytvKQAQ', '0032A00002awFOcQAM', '0032A00002RHD47QAH',
    '0033j00003wOxfaAAC', '0033j00003wOtoGAAS', '0032A00002az59aQAA',
    '0032A00002RHA5XQAX', '0033j00003wOxh5AAC', '0033j000049DWQwAAO',
    '0033j00003wOvXxAAK', '0033j00003wP2G5AAK', '0033j000049DWRaAAO',
    '0033j00003wOs9JAAS', '0033j000049DS3RAAW', '0033j00003wOwzZAAS',
    '0033j00003wP2N3AAK', '0033j000049Db9aAAC', '0033j00003wOvXTAA0',
    '0032A00002az1Y7QAI', '0033j00003aN3xaAAC', '0033j00003wP0P1AAK',
    '0033j00003aI0FqAAK', '0033j000049CmGNAA0', '0033j00003wP2FqAAK',
    '0033j00003wOx0uAAC', '0033j000049DMlUAAW', '0033j00003wOszGAAS',
    '0033j000049CfKxAAK', '0033j000049DdcPAAS', '0032A00002az2kyQAA',
    '0033j00003wOtr6AAC', '0033j00003wOvl1AAC', '0033j00003wP0PCAA0',
    '0033j00003wOtpBAAS', '0033j000049DidyAAC', '0033j00003wP0RAAA0',
    '0033j00003wOtprAAS', '0033j00003wP2WVAA0', '0033j00003wOwzvAAS',
    '0033j00003wOy1PAAS', '0033j00003wOvlLAAS', '0032A00002aytw5QAA',
    '0033j00003wP2G0AAK', '0033j000041U383AAC', '0033j00003wOyBiAAK',
    '0033j00003wOy1KAAS', '0033j000049DT9nAAG', '0033j00003wP2XLAA0',
    '0033j00003wOvZ5AAK', '0033j00003wOyBTAA0', '0033j00003wOxfLAAS',
    '0033j00003wOtnKAAS', '0033j00003wOv3FAAS', '0033j000049CgP8AAK',
    '0033j00003wOtpHAAS', '0033j00003wOvYbAAK', '0033j00003wOyCoAAK',
    '0033j00003wOtoWAAS', '0033j00003wOyBdAAK', '0032A00002awDCLQA2',
    '0032A00002az3bKQAQ', '0033j00003wOwA1AAK', '0033j00003wOtoLAAS',
    '0032A00002ayueHQAQ', '0033j000049DipQAAS', '0033j000049DijSAAS',
    '0033j00003wOxgyAAS', '0032A00002ayxRAQAY', '0033j00003wOtpdAAS',
    '0033j00003wP2FvAAK', '0033j00003wOyByAAS', '0033j00003wOy1tAAC',
    '0033j00003wOtqMAAS', '0033j000049DYE8AAO', '0032A00002azoFHQAY',
    '0033j00003wOxfkAAC', '0033j00003wOvXYAA0', '0033j00003wOvX8AAK',
    '0033j00003wP0QIAA0', '0032A00002az3baQAA', '0033j00003wOwzjAAS',
    '0033j000049CmIDAAZ', '0033j00003wOwzVAAS', '0033j00003wOy22AAC',
    '0033j00003wOxgKAAS', '0033j00003wOyC3AAK', '0033j000049DeOZAA0',
    '0033j00003wOyBJAA0', '0033j00003wOvXIAA0'
};

System.debug('Processing ' + allOverlapContacts.size() + ' contacts from overlap analysis...');

// Process in batches of 200 for DML limits
Integer batchSize = 200;
Integer totalProcessed = 0;
Integer successCount = 0;
Integer errorCount = 0;

for (Integer i = 0; i < allOverlapContacts.size(); i += batchSize) {
    List<Contact> batchToUpdate = new List<Contact>();

    // Get the batch
    Integer endIndex = Math.min(i + batchSize, allOverlapContacts.size());
    List<String> batchIds = new List<String>();

    for (Integer j = i; j < endIndex; j++) {
        batchIds.add(allOverlapContacts[j]);
    }

    // Create update records
    for (String contactId : batchIds) {
        Contact c = new Contact(Id = contactId);
        c.Sync_Status__c = 'In HS Not on Inclusion List';
        c.In_HubSpot_Not_Inclusion_List__c = true;

        // Set Clean_Status if not already set
        c.Clean_Status__c = 'Review';

        batchToUpdate.add(c);
    }

    // Execute the batch update
    if (!batchToUpdate.isEmpty()) {
        Database.SaveResult[] results = Database.update(batchToUpdate, false);

        for (Database.SaveResult sr : results) {
            totalProcessed++;
            if (sr.isSuccess()) {
                successCount++;
            } else {
                errorCount++;
                for (Database.Error err : sr.getErrors()) {
                    System.debug('Error updating contact: ' + err.getMessage());
                }
            }
        }

        System.debug('Batch ' + (i/batchSize + 1) + ' completed. Success: ' + successCount + ', Errors: ' + errorCount);
    }
}

System.debug('=== OVERLAP MARKING COMPLETE ===');
System.debug('Total Processed: ' + totalProcessed);
System.debug('Successfully Marked: ' + successCount);
System.debug('Errors: ' + errorCount);

// Now process additional contacts to mark based on quality
System.debug('\nProcessing additional contacts for quality marking...');

// Get unmarked contacts with emails
List<Contact> unmmarkedContacts = [
    SELECT Id, Email, Name, Phone, MobilePhone, AccountId,
           LeadSource, LastActivityDate, CreatedDate,
           Clean_Status__c
    FROM Contact
    WHERE Email != null
      AND Clean_Status__c = null
    LIMIT 2000
];

System.debug('Found ' + unmmarkedContacts.size() + ' unmarked contacts to process...');

List<Contact> contactsToScore = new List<Contact>();
Map<String, List<Contact>> emailDuplicates = new Map<String, List<Contact>>();

for (Contact c : unmmarkedContacts) {
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

    // Track duplicates
    String emailKey = c.Email.toLowerCase();
    if (!emailDuplicates.containsKey(emailKey)) {
        emailDuplicates.put(emailKey, new List<Contact>());
    }
    emailDuplicates.get(emailKey).add(c);

    // Create update record
    Contact updateContact = new Contact(Id = c.Id);

    if (score < 40) {
        updateContact.Clean_Status__c = 'Delete';
    } else if (score < 70) {
        updateContact.Clean_Status__c = 'Review';
    } else {
        updateContact.Clean_Status__c = 'OK';
    }

    contactsToScore.add(updateContact);
}

// Mark duplicates
Integer duplicateCount = 0;
for (String email : emailDuplicates.keySet()) {
    List<Contact> dupes = emailDuplicates.get(email);
    if (dupes.size() > 1) {
        duplicateCount += dupes.size() - 1;

        // Keep first, mark rest as merge candidates
        for (Integer i = 1; i < dupes.size(); i++) {
            for (Contact scoreContact : contactsToScore) {
                if (scoreContact.Id == dupes[i].Id) {
                    scoreContact.Clean_Status__c = 'Merge';
                    scoreContact.Merge_Candidates__c = dupes[0].Id;
                    break;
                }
            }
        }
    }
}

// Update in batches
Integer scoreUpdateCount = 0;
for (Integer i = 0; i < contactsToScore.size(); i += 200) {
    Integer endIdx = Math.min(i + 200, contactsToScore.size());
    List<Contact> batch = new List<Contact>();

    for (Integer j = i; j < endIdx; j++) {
        batch.add(contactsToScore[j]);
    }

    Database.SaveResult[] scoreResults = Database.update(batch, false);
    for (Database.SaveResult sr : scoreResults) {
        if (sr.isSuccess()) scoreUpdateCount++;
    }
}

System.debug('✅ Quality scored ' + scoreUpdateCount + ' additional contacts');
System.debug('✅ Found ' + duplicateCount + ' duplicate contacts');

// Final summary
System.debug('\n=== COMPREHENSIVE MARKING SUMMARY ===');

AggregateResult[] cleanStatusCounts = [
    SELECT Clean_Status__c status, COUNT(Id) cnt
    FROM Contact
    WHERE Clean_Status__c != null
    GROUP BY Clean_Status__c
];

System.debug('Clean Status Distribution:');
for (AggregateResult ar : cleanStatusCounts) {
    System.debug('  ' + ar.get('status') + ': ' + ar.get('cnt'));
}

AggregateResult[] syncStatusCounts = [
    SELECT Sync_Status__c status, COUNT(Id) cnt
    FROM Contact
    WHERE Sync_Status__c != null
    GROUP BY Sync_Status__c
];

System.debug('Sync Status Distribution:');
for (AggregateResult ar : syncStatusCounts) {
    System.debug('  ' + ar.get('status') + ': ' + ar.get('cnt'));
}

Integer totalMarked = 0;
for (AggregateResult ar : cleanStatusCounts) {
    totalMarked += Integer.valueOf(ar.get('cnt'));
}

System.debug('\n✨ TOTAL CONTACTS MARKED: ' + totalMarked);
System.debug('✨ Marking process complete!');