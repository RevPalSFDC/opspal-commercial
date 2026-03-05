const { execSync } = require('child_process');
const fs = require('fs');

function clearContactFields() {
    try {
        // Execute query and get JSON
        const queryCmd = 'sf data query --query "SELECT Id FROM Contact WHERE In_HubSpot_Not_Inclusion_List__c = true" --target-org rentable-production --json';
        const queryResult = JSON.parse(execSync(queryCmd, { encoding: 'utf-8' }));

        const recordCount = queryResult.result.records.length;
        console.log(`Found ${recordCount} records to update`);

        if (recordCount === 0) {
            console.log('No records to update');
            return;
        }

        // Create update commands
        const updateCmds = queryResult.result.records.map(record =>
            `sf data update record --sobject Contact --record-id ${record.Id} --values "In_HubSpot_Not_Inclusion_List__c=false,IsMaster__c=false" --target-org rentable-production`
        );

        // Execute updates
        updateCmds.forEach(cmd => {
            try {
                const result = execSync(cmd, { encoding: 'utf-8' });
                console.log('Update result:', result);
            } catch (err) {
                console.error('Update error:', err.message);
            }
        });

        // Verify update
        const verifyCmd = 'sf data query --query "SELECT COUNT() FROM Contact WHERE In_HubSpot_Not_Inclusion_List__c = true" --target-org rentable-production';
        const verifyResult = execSync(verifyCmd, { encoding: 'utf-8' });

        console.log('Verification result:', verifyResult.trim());

    } catch (error) {
        console.error('Error in bulk update:', error);
        throw error;
    }
}

clearContactFields();