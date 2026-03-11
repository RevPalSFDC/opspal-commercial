# Live Wire Sync Test - Salesforce Field Templates

This directory contains Salesforce metadata templates for the Live Wire Sync Test custom fields.

## Overview

These templates define 12 custom fields for both **Account** and **Contact** objects (24 total fields) required for bidirectional sync testing between Salesforce and HubSpot.

## Field Definitions

### Core Sync Fields

1. **Sync_Anchor__c** (Text 64, External ID, Unique)
   - Stable UUID identifier - **never regenerated**
   - Primary join key between Salesforce and HubSpot
   - Critical for collision detection

2. **Hubspot_ID__c** (Text 50, External ID, Unique)
   - HubSpot Company/Contact ID
   - Fallback join if Sync Anchor not available

### Probe Fields

3. **Wire_Test_1__c** (Checkbox)
   - SF→HS sync probe
   - Toggled in Salesforce, polled in HubSpot

4. **Wire_Test_2__c** (Checkbox)
   - HS→SF sync probe
   - Toggled in HubSpot, polled in Salesforce

5. **Manual_Sync__c** (Checkbox)
   - Manual trigger for on-demand sync testing

### Tracking & Diagnostics

6. **Last_Sync_Time__c** (DateTime)
   - Timestamp of last successful sync

7. **Last_Sync_Direction__c** (Picklist: HS→SF | SF→HS | Unknown)
   - Direction of last sync operation

8. **Wire_Test_Run_ID__c** (Text 64)
   - UUID of current test run
   - Prevents reacting to own toggle changes

9. **Wire_Test_Timestamp__c** (DateTime)
   - When probe was initiated
   - Used to calculate propagation lag

10. **Last_Sync_Error__c** (Long Text)
    - Optional error message for debugging

### ID History (Merge Tracking)

11. **Former_SFDC_IDs__c** (Long Text)
    - Comma-separated list of former Salesforce IDs
    - Append only - never overwrite

12. **Former_Hubspot_IDs__c** (Long Text)
    - Comma-separated list of former HubSpot IDs
    - Append only - never overwrite

## Deployment

### Option 1: Salesforce CLI (Recommended)

```bash
# Deploy all fields at once
sf project deploy start \
  --source-dir ./force-app/main/default \
  --target-org your-org-alias

# Verify deployment
sf sobject describe Account | jq '.fields[] | select(.name | contains("Sync_Anchor"))'
```

### Option 2: Deploy via Script

The Live Wire Sync Test script will automatically deploy these fields when running in setup mode:

```bash
/live-wire-sync-test --setup-only --org-alias your-org
```

### Option 3: Manual Deployment

1. Navigate to Setup → Object Manager → Account → Fields & Relationships
2. Click "New" and manually create each field using the metadata XML as reference
3. Repeat for Contact object

## Post-Deployment

### Verify Field Creation

```bash
# Check Account fields
sf data query --query "SELECT COUNT() FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Account' AND QualifiedApiName LIKE 'Sync_Anchor%' OR QualifiedApiName LIKE 'Wire_Test%'" --use-tooling-api --target-org your-org

# Check Contact fields
sf data query --query "SELECT COUNT() FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Contact' AND QualifiedApiName LIKE 'Sync_Anchor%' OR QualifiedApiName LIKE 'Wire_Test%'" --use-tooling-api --target-org your-org
```

### Configure Connector Mappings

**Critical**: Add these field mappings to your HubSpot-Salesforce connector:

| Salesforce Field | HubSpot Property | Direction |
|------------------|------------------|-----------|
| `Sync_Anchor__c` | `sync_anchor` | Bidirectional |
| `Wire_Test_1__c` | `wire_test_1` | Bidirectional |
| `Wire_Test_2__c` | `wire_test_2` | Bidirectional |
| `Hubspot_ID__c` | HS Record ID (automatic) | HS→SF |
| `Last_Sync_Time__c` | `last_sync_time` | Bidirectional |
| `Wire_Test_Run_ID__c` | `wire_test_run_id` | Bidirectional |
| `Wire_Test_Timestamp__c` | `wire_test_timestamp` | Bidirectional |
| `Last_Sync_Direction__c` | `last_sync_direction` | Bidirectional |

**DO NOT map**: `Former_SFDC_IDs__c` and `Former_Hubspot_IDs__c` - these are managed by the test script only.

### Make Sync Anchor Read-Only in Connector

**CRITICAL**: Configure your connector to NOT overwrite `Sync_Anchor__c` / `sync_anchor` once set. This field should only be written during initial backfill, never during sync operations.

## Field-Level Security

Ensure the integration user has **Read** and **Edit** permissions on all 12 fields for both Account and Contact:

```bash
# Via Salesforce CLI (example for a permission set)
sf org assign permset --name Wire_Test_Fields --target-org your-org
```

Or manually:
1. Setup → Users → Permission Sets
2. Create "Wire Test Fields" permission set
3. Object Settings → Account → Edit
4. Select all 12 Wire Test fields
5. Repeat for Contact

## Troubleshooting

### "Field does not exist" error

- Verify deployment: `sf project deploy report --job-id YOUR_JOB_ID`
- Check API version (must be ≥v45.0)
- Ensure no naming conflicts with existing fields

### "External ID conflict" error

- Check for existing External ID fields on Sync_Anchor__c or Hubspot_ID__c
- Only 7 External ID fields allowed per object (Salesforce limit)

### Deployment validation errors

- Run pre-deployment validator:
  ```bash
  node "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plugin-path-resolver.js" resolve-script opspal-salesforce scripts/lib/deployment-source-validator.js)" validate-source ./force-app
  ```

## Files

```
force-app/main/default/
├── package.xml                    # Deployment manifest
└── objects/
    ├── Account/fields/            # 12 Account custom fields
    │   ├── Sync_Anchor__c.field-meta.xml
    │   ├── Wire_Test_1__c.field-meta.xml
    │   └── ... (10 more)
    └── Contact/fields/            # 12 Contact custom fields
        ├── Sync_Anchor__c.field-meta.xml
        ├── Wire_Test_1__c.field-meta.xml
        └── ... (10 more)
```

## License

Internal use only - RevPal Engineering
