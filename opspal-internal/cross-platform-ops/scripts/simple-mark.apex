// Simple test to mark contacts
System.debug('Starting simple marking test...');

// First, let's check what fields are available
List<String> fields = new List<String>();
Map<String, Schema.SObjectField> fieldMap = Schema.SObjectType.Contact.fields.getMap();
for(String fieldName : fieldMap.keySet()) {
    if(fieldName.containsIgnoreCase('hubspot') || fieldName.containsIgnoreCase('sync') || fieldName.containsIgnoreCase('inclusion')) {
        fields.add(fieldName);
    }
}
System.debug('Found HubSpot/Sync related fields: ' + fields);

// Try a simple update with the found fields
List<Contact> testContacts = [SELECT Id FROM Contact WHERE Email != null LIMIT 5];
System.debug('Found ' + testContacts.size() + ' test contacts');

// Get specific contact for testing
if (!testContacts.isEmpty()) {
    Contact c = testContacts[0];

    // Try to set the field dynamically
    try {
        // Check if field exists
        if (fieldMap.containsKey('in_hubspot_not_inclusion_list__c')) {
            c.put('In_HubSpot_Not_Inclusion_List__c', true);
            System.debug('✅ Field In_HubSpot_Not_Inclusion_List__c exists and was set');
        } else {
            System.debug('❌ Field In_HubSpot_Not_Inclusion_List__c not found in schema');
        }

        if (fieldMap.containsKey('sync_status__c')) {
            c.put('Sync_Status__c', 'In HS Not on Inclusion List');
            System.debug('✅ Field Sync_Status__c exists and was set');
        } else {
            System.debug('❌ Field Sync_Status__c not found in schema');
        }

        update c;
        System.debug('✅ Successfully updated contact: ' + c.Id);
    } catch (Exception e) {
        System.debug('❌ Error updating: ' + e.getMessage());
    }
}

System.debug('Test complete');