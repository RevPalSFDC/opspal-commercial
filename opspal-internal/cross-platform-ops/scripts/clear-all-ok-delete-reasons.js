#!/usr/bin/env node
/**
 * Clear ALL Delete_Reason__c for OK status contacts
 * Uses direct SOQL update instead of CSV export
 */

const { execSync } = require('child_process');

const SALESFORCE_ORG = 'rentable-production';

async function clearAllOKDeleteReasons() {
    console.log('Clearing Delete_Reason__c for ALL OK status contacts...');

    try {
        // Use sf data update with SOQL WHERE clause
        const updateCommand = `sf data update record --sobject Contact --where "Clean_Status__c = 'OK' AND Delete_Reason__c != null" --values "Delete_Reason__c=''" --target-org ${SALESFORCE_ORG} --json`;
        
        console.log('Executing bulk update...');
        const result = execSync(updateCommand, { 
            encoding: 'utf8', 
            maxBuffer: 50 * 1024 * 1024 
        });

        const jsonResult = JSON.parse(result);
        
        if (jsonResult.status === 0) {
            console.log(`✅ Successfully cleared Delete_Reason__c for ${jsonResult.result?.length || 'all'} OK status contacts`);
        } else {
            console.log('Update result:', jsonResult);
        }

        // Verify the update
        console.log('\nVerifying update...');
        const verifyQuery = `SELECT COUNT(Id) FROM Contact WHERE Clean_Status__c = 'OK' AND Delete_Reason__c != null AND Delete_Reason__c != ''`;
        const verifyResult = execSync(
            `sf data query --query "${verifyQuery}" --target-org ${SALESFORCE_ORG} --json`,
            { encoding: 'utf8' }
        );
        
        const verifyJson = JSON.parse(verifyResult);
        const remainingCount = verifyJson.result?.records?.[0]?.expr0 || 0;
        
        if (remainingCount === 0) {
            console.log('✅ Verification successful: No OK status contacts have Delete_Reason populated');
        } else {
            console.log(`⚠️ Warning: ${remainingCount} OK status contacts still have Delete_Reason populated`);
            console.log('These may need manual intervention or there may be a trigger preventing the update');
        }
        
    } catch (error) {
        console.error('Error updating records:', error.message);
        
        // Try alternative approach with smaller batches
        console.log('\nTrying alternative approach with direct record updates...');
        
        try {
            // First get all the IDs
            const query = `SELECT Id FROM Contact WHERE Clean_Status__c = 'OK' AND Delete_Reason__c != null AND Delete_Reason__c != '' LIMIT 1000`;
            const queryResult = execSync(
                `sf data query --query "${query}" --target-org ${SALESFORCE_ORG} --json`,
                { encoding: 'utf8' }
            );
            
            const records = JSON.parse(queryResult).result?.records || [];
            console.log(`Found ${records.length} records to update`);
            
            // Update each record individually (slower but more reliable)
            let successCount = 0;
            for (const record of records) {
                try {
                    execSync(
                        `sf data update record --sobject Contact --record-id ${record.Id} --values "Delete_Reason__c=''" --target-org ${SALESFORCE_ORG}`,
                        { encoding: 'utf8' }
                    );
                    successCount++;
                    if (successCount % 50 === 0) {
                        process.stdout.write(`\rUpdated ${successCount}/${records.length} records`);
                    }
                } catch (updateError) {
                    console.error(`\nFailed to update ${record.Id}:`, updateError.message);
                }
            }
            
            console.log(`\n✅ Updated ${successCount} out of ${records.length} records`);
            
        } catch (altError) {
            console.error('Alternative approach also failed:', altError.message);
        }
    }
}

clearAllOKDeleteReasons().catch(console.error);