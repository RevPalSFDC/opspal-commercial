// Minimal script to run RIGHT NOW without CPU timeout
// Processes only 100 contacts at a time

Integer processed = 0;
Integer errors = 0;

// Get small batch of unmarked contacts
List<Contact> batch = [
    SELECT Id, Email, Phone, MobilePhone, AccountId, Name,
           HubSpot_Contact_ID__c
    FROM Contact
    WHERE Email != null
      AND Clean_Status__c = null
    LIMIT 100
];

System.debug('Processing ' + batch.size() + ' contacts...');

// Single pass, minimal logic
for (Contact c : batch) {
    // Ultra-simple scoring
    Integer pts = 0;
    if (c.Email != null) pts += 30;
    if (c.Phone != null || c.MobilePhone != null) pts += 30;
    if (c.AccountId != null) pts += 20;
    if (c.Name != null && c.Name != 'Unknown') pts += 20;

    // Set statuses
    c.Clean_Status__c = (pts >= 70) ? 'OK' : (pts >= 40 ? 'Review' : 'Delete');
    c.Sync_Status__c = (c.HubSpot_Contact_ID__c != null) ? 'Synced' : 'Not Synced';
}

// Single DML
Database.SaveResult[] results = Database.update(batch, false);

for (Database.SaveResult sr : results) {
    if (sr.isSuccess()) processed++;
    else errors++;
}

System.debug('✅ Marked: ' + processed + ', Errors: ' + errors);

// Check remaining
Integer remaining = [SELECT COUNT() FROM Contact
                    WHERE Email != null AND Clean_Status__c = null];

System.debug('📊 Remaining unmarked: ' + remaining);

if (remaining > 0) {
    System.debug('💡 Run this script again to process next 100');
}

// Show current distribution
for (AggregateResult ar : [
    SELECT Clean_Status__c status, COUNT(Id) cnt
    FROM Contact
    WHERE Clean_Status__c != null
    GROUP BY Clean_Status__c
]) {
    System.debug(ar.get('status') + ': ' + ar.get('cnt'));
}