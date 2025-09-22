
// Apex script to update contacts with Clean_Status__c and related fields
// Run this once the custom fields are available in the org

List<Contact> contactsToUpdate = new List<Contact>();

// Contacts in both systems but not synced
Set<Id> inBothNotSynced = new Set<Id>{
    '0032A00002RHA6DQAX',
    '0032A00002SFDkbQAH',
    '0032A00002SFDmXQAX'
};

// Low quality contacts
Set<Id> lowQualityIds = new Set<Id>{
    
};

// Duplicate contact IDs
Set<Id> duplicateIds = new Set<Id>();
undefined

// Query and update contacts
for (Contact c : [SELECT Id FROM Contact WHERE Id IN :inBothNotSynced OR Id IN :lowQualityIds OR Id IN :duplicateIds]) {
    Contact updateContact = new Contact(Id = c.Id);

    // Check field availability before setting
    Map<String, Schema.SObjectField> fieldMap = Schema.SObjectType.Contact.fields.getMap();

    if (inBothNotSynced.contains(c.Id)) {
        if (fieldMap.containsKey('sync_status__c')) {
            updateContact.put('Sync_Status__c', 'In HS Not on Inclusion List');
        }
        if (fieldMap.containsKey('in_hubspot_not_inclusion_list__c')) {
            updateContact.put('In_HubSpot_Not_Inclusion_List__c', true);
        }
    }

    if (lowQualityIds.contains(c.Id)) {
        if (fieldMap.containsKey('clean_status__c')) {
            updateContact.put('Clean_Status__c', 'Review');
        }
        if (fieldMap.containsKey('data_quality_score__c')) {
            // Would need to recalculate score here
            updateContact.put('Data_Quality_Score__c', 30);
        }
    }

    if (duplicateIds.contains(c.Id)) {
        if (fieldMap.containsKey('clean_status__c')) {
            updateContact.put('Clean_Status__c', 'Merge');
        }
    }

    contactsToUpdate.add(updateContact);
}

if (!contactsToUpdate.isEmpty()) {
    Database.update(contactsToUpdate, false); // Allow partial success
    System.debug('Updated ' + contactsToUpdate.size() + ' contacts');
}
