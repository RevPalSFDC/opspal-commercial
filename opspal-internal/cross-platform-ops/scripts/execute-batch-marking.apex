// Execute batch marking for unmarked contacts
System.debug('Starting batch marking process...');

// Query current status
AggregateResult[] beforeCounts = [
    SELECT Clean_Status__c status, COUNT(Id) cnt
    FROM Contact
    WHERE Clean_Status__c != null
    GROUP BY Clean_Status__c
];

System.debug('=== BEFORE MARKING ===');
Integer totalBefore = 0;
for (AggregateResult ar : beforeCounts) {
    System.debug(ar.get('status') + ': ' + ar.get('cnt'));
    totalBefore += Integer.valueOf(ar.get('cnt'));
}
System.debug('Total marked before: ' + totalBefore);

// Process next batch of unmarked contacts
List<Contact> unmarkedContacts = [
    SELECT Id, Email, Name, Phone, MobilePhone, AccountId,
           LeadSource, LastActivityDate, CreatedDate
    FROM Contact
    WHERE Email != null
      AND Clean_Status__c = null
    LIMIT 1000
];

System.debug('Found ' + unmarkedContacts.size() + ' unmarked contacts to process');

List<Contact> toUpdate = new List<Contact>();
Map<String, List<Contact>> emailMap = new Map<String, List<Contact>>();
Integer okCount = 0;
Integer reviewCount = 0;
Integer deleteCount = 0;

for (Contact c : unmarkedContacts) {
    // Track by email for duplicates
    String email = c.Email.toLowerCase();
    if (!emailMap.containsKey(email)) {
        emailMap.put(email, new List<Contact>());
    }
    emailMap.get(email).add(c);

    // Calculate score
    Integer score = 0;
    if (c.Email != null) score += 30;
    if (c.Phone != null || c.MobilePhone != null) score += 20;
    if (c.Name != null && c.Name != 'Unknown') score += 20;
    if (c.LeadSource != null) score += 10;
    if (c.AccountId != null) score += 10;
    if (c.LastActivityDate != null) {
        Integer days = Date.today().daysBetween(c.LastActivityDate);
        if (Math.abs(days) < 90) score += 10;
    }

    // Create update
    Contact upd = new Contact(Id = c.Id);
    if (score < 40) {
        upd.Clean_Status__c = 'Delete';
        deleteCount++;
    } else if (score < 70) {
        upd.Clean_Status__c = 'Review';
        reviewCount++;
    } else {
        upd.Clean_Status__c = 'OK';
        okCount++;
    }

    toUpdate.add(upd);
}

// Mark duplicates
Integer mergeCount = 0;
for (String email : emailMap.keySet()) {
    List<Contact> dupes = emailMap.get(email);
    if (dupes.size() > 1) {
        // Keep first, mark rest for merge
        for (Integer i = 1; i < dupes.size(); i++) {
            for (Contact upd : toUpdate) {
                if (upd.Id == dupes[i].Id) {
                    upd.Clean_Status__c = 'Merge';
                    upd.Merge_Candidates__c = dupes[0].Id;
                    mergeCount++;

                    // Adjust counts
                    if (upd.Clean_Status__c == 'OK') okCount--;
                    else if (upd.Clean_Status__c == 'Review') reviewCount--;
                    else if (upd.Clean_Status__c == 'Delete') deleteCount--;
                    break;
                }
            }
        }
    }
}

System.debug('Categories: OK=' + okCount + ', Review=' + reviewCount + ', Delete=' + deleteCount + ', Merge=' + mergeCount);

// Update in batches of 200
Integer successCount = 0;
Integer errorCount = 0;

for (Integer i = 0; i < toUpdate.size(); i += 200) {
    List<Contact> batch = new List<Contact>();
    Integer endIdx = Math.min(i + 200, toUpdate.size());

    for (Integer j = i; j < endIdx; j++) {
        batch.add(toUpdate[j]);
    }

    Database.SaveResult[] results = Database.update(batch, false);

    for (Database.SaveResult sr : results) {
        if (sr.isSuccess()) {
            successCount++;
        } else {
            errorCount++;
        }
    }
}

System.debug('✅ Successfully marked: ' + successCount);
System.debug('❌ Errors: ' + errorCount);

// Query final status
AggregateResult[] afterCounts = [
    SELECT Clean_Status__c status, COUNT(Id) cnt
    FROM Contact
    WHERE Clean_Status__c != null
    GROUP BY Clean_Status__c
];

System.debug('\n=== AFTER MARKING ===');
Integer totalAfter = 0;
for (AggregateResult ar : afterCounts) {
    System.debug(ar.get('status') + ': ' + ar.get('cnt'));
    totalAfter += Integer.valueOf(ar.get('cnt'));
}
System.debug('Total marked after: ' + totalAfter);
System.debug('New contacts marked: ' + (totalAfter - totalBefore));

// Check remaining unmarked
Integer remainingUnmarked = [
    SELECT COUNT()
    FROM Contact
    WHERE Email != null
      AND Clean_Status__c = null
];

System.debug('\n📊 SUMMARY:');
System.debug('Total contacts marked: ' + totalAfter);
System.debug('Remaining unmarked with emails: ' + remainingUnmarked);
System.debug('Progress: ' + (totalAfter * 100 / (totalAfter + remainingUnmarked)) + '%');

if (remainingUnmarked > 0) {
    System.debug('💡 Run this script again to process next batch of ' + Math.min(5000, remainingUnmarked) + ' contacts');
}

System.debug('✨ Batch marking complete!');