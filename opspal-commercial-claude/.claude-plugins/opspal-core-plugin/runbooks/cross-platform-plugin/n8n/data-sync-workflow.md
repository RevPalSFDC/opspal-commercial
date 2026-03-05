# Creating a New Data Sync Workflow

A solution-agnostic guide for creating bidirectional data synchronization workflows between platforms using n8n.

## Purpose

This runbook provides step-by-step instructions for creating a data sync workflow that moves data between two systems (e.g., Salesforce and HubSpot). The patterns apply to any source-target combination.

## Prerequisites

- [ ] n8n Cloud account with API access
- [ ] API credentials for both source and target systems
- [ ] Field mapping document (which fields sync to which)
- [ ] Understanding of data relationships in both systems
- [ ] Test environment access for both platforms

## Procedure

### Step 1: Define Sync Requirements

**Actions:**
1. Identify source object (e.g., Lead, Contact, Account)
2. Identify target object (e.g., Contact, Company, Deal)
3. Document field mappings
4. Determine sync direction (one-way or bidirectional)
5. Define sync frequency (real-time, scheduled, manual)

**Expected Result:** Clear specification document with objects, fields, and timing.

### Step 2: Create Credentials in n8n

**Actions:**
1. Navigate to n8n Settings > Credentials
2. Create credential for source system (e.g., Salesforce OAuth2)
3. Create credential for target system (e.g., HubSpot API)
4. Test both credentials

**Expected Result:** Both credentials show "Connected" status.

### Step 3: Create the Workflow Structure

**Actions:**
1. Create new workflow in n8n
2. Add trigger node based on sync frequency:
   - **Real-time**: Use platform webhook/trigger node
   - **Scheduled**: Use Schedule Trigger node
   - **Manual**: Use Manual Trigger node
3. Add source system node to fetch data
4. Add transformation node (Set or Code node) for field mapping
5. Add target system node to create/update records

**Expected Result:** Workflow structure with trigger → fetch → transform → upsert.

### Step 4: Configure Field Mappings

**Actions:**
1. In the Set node, map source fields to target fields:
   ```javascript
   // Example mapping
   {
     "email": "={{ $json.Email }}",
     "firstName": "={{ $json.FirstName }}",
     "lastName": "={{ $json.LastName }}",
     "company": "={{ $json.Company }}"
   }
   ```
2. Handle data type conversions (dates, booleans, picklists)
3. Add default values for required fields
4. Handle null/empty values appropriately

**Expected Result:** All fields mapped with proper transformations.

### Step 5: Add Error Handling

**Actions:**
1. Add Error Trigger node to catch failures
2. Configure retry logic for transient errors
3. Add notification node for critical failures (Slack, Email)
4. Consider dead-letter queue for failed records

**Expected Result:** Workflow handles errors gracefully without data loss.

### Step 6: Add Duplicate Prevention

**Actions:**
1. Identify unique key for matching (email, external ID)
2. Configure upsert operation in target node
3. Add external ID field to track synced records
4. Implement loop prevention for bidirectional syncs

**Expected Result:** Records update if existing, create if new.

### Step 7: Test in Sandbox

**Actions:**
1. Connect to sandbox/test environments
2. Run workflow with 5-10 test records
3. Verify field mappings are correct
4. Test error scenarios (invalid data, duplicates)
5. Verify external IDs are populated

**Expected Result:** All test records sync correctly with proper field values.

### Step 8: Configure for Production

**Actions:**
1. Update credentials to production systems
2. Adjust batch sizes for volume (200 records for Salesforce)
3. Add rate limiting delays if needed
4. Enable workflow activation

**Expected Result:** Workflow ready for production execution.

### Step 9: Activate and Monitor

**Actions:**
1. Activate the workflow
2. Monitor first few executions
3. Verify records in target system
4. Check error logs for issues

**Expected Result:** Workflow running successfully in production.

## Validation

### Success Criteria
- [ ] Records sync within expected timeframe
- [ ] All mapped fields contain correct values
- [ ] External IDs populate correctly
- [ ] No duplicate records created
- [ ] Error handling captures failures
- [ ] Notifications sent for critical errors

### Verification Queries

**Salesforce:**
```sql
SELECT Id, Name, External_ID__c, LastModifiedDate
FROM [Object]
WHERE External_ID__c != null
ORDER BY LastModifiedDate DESC
LIMIT 10
```

**HubSpot:**
Check contact/company/deal records for corresponding external IDs.

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Records not syncing | Trigger not firing | Check trigger configuration and permissions |
| Field values empty | Incorrect expression | Verify field paths in mapping (case-sensitive) |
| Duplicate records | Upsert not configured | Use upsert operation with unique key |
| Rate limit errors | Too many requests | Add Wait node between batches |
| Authentication failed | Expired token | Refresh OAuth token or regenerate API key |
| Sync loop (bidirectional) | Missing origin check | Add field to track last sync source |
| Timeout errors | Large record volume | Reduce batch size, add pagination |

## Rollback

### If Sync Creates Bad Data:
1. Deactivate the workflow immediately
2. Identify affected records via execution logs
3. Export records to CSV for reference
4. Delete or update incorrect records
5. Fix workflow issue
6. Re-sync from source of truth

### If Workflow Causes System Issues:
1. Deactivate workflow
2. Check API limits in both systems
3. Review error logs
4. Reduce batch sizes or add delays
5. Test in sandbox before reactivating

## Related Resources

- **Agents:**
  - `n8n-workflow-builder` - Create workflows from specifications
  - `n8n-integration-orchestrator` - Design multi-platform integrations
  - `n8n-execution-monitor` - Debug execution issues

- **Scripts:**
  - `n8n-node-mapper.js` - Generate field mappings
  - `n8n-workflow-validator.js` - Validate workflow before deployment

- **Configs:**
  - `n8n-sf-hs-mappings.json` - Standard SF↔HS field mappings
  - `n8n-node-templates.json` - Pre-built sync workflow templates

- **Other Runbooks:**
  - `error-handling-strategy.md` - Add robust error handling
  - `workflow-lifecycle.md` - Manage workflow states

---

**Version:** 1.0.0
**Last Updated:** 2025-12-03
