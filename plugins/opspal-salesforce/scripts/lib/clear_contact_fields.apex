// Batch class to update Contact fields
public class ContactFieldCleaner implements Database.Batchable<sObject> {
    public Database.QueryLocator start(Database.BatchableContext BC) {
        return Database.getQueryLocator([
            SELECT Id
            FROM Contact
            WHERE In_HubSpot_Not_Inclusion_List__c = true
        ]);
    }

    public void execute(Database.BatchableContext BC, List<Contact> scope) {
        List<Contact> contactsToUpdate = new List<Contact>();

        for (Contact con : scope) {
            con.In_HubSpot_Not_Inclusion_List__c = false;
            con.IsMaster__c = false;
            contactsToUpdate.add(con);
        }

        if (!contactsToUpdate.isEmpty()) {
            Database.update(contactsToUpdate, false); // Allow partial success
        }
    }

    public void finish(Database.BatchableContext BC) {
        // Optional: Send completion email or log
        Integer remainingCount = [
            SELECT COUNT()
            FROM Contact
            WHERE In_HubSpot_Not_Inclusion_List__c = true
        ];

        System.debug('Remaining records with In_HubSpot_Not_Inclusion_List__c = true: ' + remainingCount);
    }
}

// Execute the batch job
ContactFieldCleaner cleaner = new ContactFieldCleaner();
Id batchJobId = Database.executeBatch(cleaner, 200); // Batch size of 200
System.debug('Batch Job ID: ' + batchJobId);