# Contact Record Marking System - Implementation Guide

## Overview

This document provides the complete implementation guide for the Contact Record Marking System, designed to clean up 254,176 Salesforce contacts and properly identify the **~52,000 contacts that exist in both Salesforce and HubSpot but are NOT on the HubSpot Inclusion List**.

## Critical Finding

**🚨 CRITICAL**: Based on our analysis, approximately **52,000 contacts exist in BOTH Salesforce and HubSpot but are NOT on the Inclusion List**. These contacts:
- Have email addresses in both systems
- Are NOT synced (no Salesforce ID in HubSpot)
- Are NOT on the HubSpot Inclusion List (List ID: 26, only 1,382 contacts)
- **Cannot sync until they are added to the Inclusion List**

---

## Phase 1: Deploy Custom Fields to Salesforce

### 1.1 Fields to Deploy

| Field API Name | Type | Purpose |
|----------------|------|---------|
| `Clean_Status__c` | Picklist | Mark records as OK, Merge, Delete, Archive, or Review |
| `Delete_Reason__c` | Picklist | Document why a record should be deleted |
| `Merge_Candidates__c` | Long Text | Semicolon-separated list of duplicate Contact IDs |
| `Data_Quality_Score__c` | Number | 0-100 score based on data completeness |
| `Sync_Status__c` | Picklist | Track sync status with HubSpot |
| `HubSpot_Contact_ID__c` | Text(18) | Store HubSpot Contact ID |
| `In_HubSpot_Not_Inclusion_List__c` | Checkbox | **TRUE if contact exists in both but NOT on Inclusion List** |

### 1.2 Deployment Steps

```bash
# 1. Navigate to the Salesforce instance directory
cd platforms/SFDC/instances/rentable-production

# 2. Deploy the metadata to Salesforce
sf project deploy start --source-dir metadata --target-org rentable-production

# 3. Verify deployment
sf org open --target-org rentable-production --path /lightning/setup/ObjectManager/Contact/FieldsAndRelationships
```

### 1.3 Verify System Administrator Permissions

The System Administrator profile has been configured with full read/write access to all new fields. No additional permission configuration needed.

---

## Phase 2: Run Data Quality Scoring

### 2.1 Execute Scoring Batch

```apex
// In Salesforce Developer Console, execute:
ContactMarkingBatch batch = new ContactMarkingBatch();
Database.executeBatch(batch, 200);
```

### 2.2 Scoring Breakdown

- **Email**: 30 points (most critical for sync)
- **Phone**: 20 points
- **Complete Name**: 20 points
- **Lead Source**: 10 points
- **Account Association**: 10 points
- **Recent Activity**: 10 points

### 2.3 Expected Distribution

| Score Range | Quality Level | Expected Count | Percentage |
|-------------|---------------|----------------|------------|
| 80-100 | High | ~50,000 | 20% |
| 60-79 | Medium | ~100,000 | 39% |
| 40-59 | Low | ~65,000 | 26% |
| 0-39 | Very Low | ~39,000 | 15% |

---

## Phase 3: Identify Contacts in Both Systems but NOT on Inclusion List

### 3.1 Run Overlap Analysis Script

```bash
# Navigate to cross-platform-ops directory
cd platforms/cross-platform-ops

# Run the overlap analysis
node scripts/analyze-sync-overlap.js
```

### 3.2 Expected Output

```
🚨 CRITICAL FINDING:
  Contacts in BOTH systems but NOT on Inclusion List: ~52,000
  Overlap Rate from Sample: 90%
  These contacts CANNOT sync because they're not on the Inclusion List!

Sample of Contacts in Both but Not on Inclusion List:
  - emthomas@americancampus.com (SF: 0033j00003wPCGyAAO)
  - kcoleman@thesciongroup.com (SF: 0032A00002ayzbkQAA)
  - annalie.ceballos@colliers.com (SF: 0033j00003wOrqsAAC)
```

### 3.3 Mark These Contacts in Salesforce

```sql
-- Update contacts that exist in both but aren't on Inclusion List
UPDATE Contact
SET Sync_Status__c = 'In HS Not on Inclusion List',
    In_HubSpot_Not_Inclusion_List__c = true
WHERE Email IN (
    -- List from overlap analysis
    'emthomas@americancampus.com',
    'kcoleman@thesciongroup.com',
    'annalie.ceballos@colliers.com'
    -- ... ~52,000 more emails
)
```

---

## Phase 4: Apply Marking Rules

### 4.1 Marking Logic Summary

| Condition | Clean Status | Delete Reason | Count |
|-----------|--------------|---------------|-------|
| No Email | Delete | No Email | 39,378 |
| Placeholder Name + Low Score | Delete | Placeholder Name | 5,408 |
| Created < 2020 & Inactive | Archive | Inactive 5+ Years | 53,572 |
| Duplicate (lower quality) | Merge | Duplicate - Lower Quality | ~2,000 |
| High Quality (Score ≥ 70) | OK | - | ~100,000 |
| Needs Review | Review | Various | ~5,000 |
| **In HS Not on Inclusion List** | OK | - | **~52,000** |

### 4.2 Execute Marking

The `ContactMarkingBatch` class will automatically apply these rules. Monitor progress via email notifications.

---

## Phase 5: Fix the Inclusion List Problem

### 5.1 Current State
- **Inclusion List Size**: 1,382 contacts (2.3% of HubSpot)
- **Contacts Missing**: ~52,000 that should be included

### 5.2 Immediate Actions

1. **Export the 52,000 contacts marked as `In_HubSpot_Not_Inclusion_List__c = true`**
   ```sql
   SELECT Id, Email, Name
   FROM Contact
   WHERE In_HubSpot_Not_Inclusion_List__c = true
   ```

2. **Update HubSpot Inclusion List Criteria**
   - Current: Too restrictive (unknown criteria)
   - Proposed: Include all contacts with:
     - Valid email address
     - Clean_Status__c = 'OK'
     - Data_Quality_Score__c ≥ 60

3. **Bulk Add to Inclusion List via HubSpot API**
   ```javascript
   // Use the cross-platform-ops suite
   npm run xplat:sync --add-to-inclusion-list --source overlap-analysis.csv
   ```

---

## Phase 6: Monitoring and Reporting

### 6.1 Key Queries

```sql
-- Summary of Clean Status
SELECT Clean_Status__c, COUNT(*)
FROM Contact
GROUP BY Clean_Status__c

-- Contacts needing Inclusion List addition
SELECT COUNT(*)
FROM Contact
WHERE In_HubSpot_Not_Inclusion_List__c = true

-- Quality score distribution
SELECT
    CASE
        WHEN Data_Quality_Score__c >= 80 THEN 'High'
        WHEN Data_Quality_Score__c >= 60 THEN 'Medium'
        WHEN Data_Quality_Score__c >= 40 THEN 'Low'
        ELSE 'Very Low'
    END as Quality,
    COUNT(*)
FROM Contact
GROUP BY Quality
```

### 6.2 Reports to Generate

1. **Inclusion List Gap Report**
   - All contacts with `In_HubSpot_Not_Inclusion_List__c = true`
   - Export for immediate action

2. **Delete Candidates Report**
   - All contacts with `Clean_Status__c = 'Delete'`
   - Group by Delete_Reason__c

3. **Merge Candidates Report**
   - All contacts with `Clean_Status__c = 'Merge'`
   - Include Merge_Candidates__c field

4. **Archive Candidates Report**
   - All contacts with `Clean_Status__c = 'Archive'`
   - Show last activity date

---

## Phase 7: Customer Approval Process

### 7.1 Export for Review

```sql
-- Export all marked records
SELECT Id, Name, Email, Clean_Status__c, Delete_Reason__c,
       Data_Quality_Score__c, Sync_Status__c,
       In_HubSpot_Not_Inclusion_List__c
FROM Contact
WHERE Clean_Status__c != null
```

### 7.2 Approval Batches

| Batch | Action | Count | Priority |
|-------|--------|-------|----------|
| 1 | Add to Inclusion List | ~52,000 | **URGENT** |
| 2 | Delete - No Email | 39,378 | High |
| 3 | Archive - Old Inactive | 53,572 | Medium |
| 4 | Merge - Duplicates | ~2,000 | Medium |
| 5 | Delete - Placeholder Names | 5,408 | Low |

---

## Expected Outcomes

### Immediate (After Marking)
- ✅ 254,176 contacts marked with Clean_Status__c
- ✅ ~52,000 contacts identified as needing Inclusion List addition
- ✅ 100% contacts with Data_Quality_Score__c

### After Inclusion List Fix
- **Before**: 1,382 contacts on Inclusion List (2.3%)
- **After**: ~53,000 contacts on Inclusion List (89% of HubSpot)
- **Sync Rate**: From 0.5% to 35%+

### After Full Cleanup
- **Total Contacts**: From 254,176 to ~150,000 (41% reduction)
- **Quality Contacts**: ~100,000 with score ≥ 70
- **Synced Contacts**: ~53,000 (35% of remaining)

---

## Troubleshooting

### Common Issues

1. **Batch Job Fails**
   ```apex
   // Check batch status
   SELECT Id, Status, JobItemsProcessed, TotalJobItems, NumberOfErrors
   FROM AsyncApexJob
   WHERE ApexClass.Name = 'ContactMarkingBatch'
   ORDER BY CreatedDate DESC
   LIMIT 1
   ```

2. **Overlap Analysis Timeout**
   - Reduce batch size in analyze-sync-overlap.js
   - Process in smaller chunks

3. **Field Not Visible**
   - Check field-level security
   - Verify profile permissions deployed

---

## Next Steps

1. **Week 1**: Deploy fields and run initial marking
2. **Week 2**: Analyze overlap and identify Inclusion List gaps
3. **Week 3**: Get customer approval and fix Inclusion List
4. **Week 4**: Execute cleanup based on approved markings
5. **Week 5**: Monitor sync improvements

---

**Document Version**: 1.0
**Created**: 2025-09-20
**Status**: Ready for Implementation

---

## Quick Reference Commands

```bash
# Deploy Salesforce metadata
sf project deploy start --source-dir metadata --target-org rentable-production

# Run overlap analysis
node scripts/analyze-sync-overlap.js

# Check marking progress
sf data query --query "SELECT Clean_Status__c, COUNT(*) FROM Contact GROUP BY Clean_Status__c" --target-org rentable-production

# Export contacts needing Inclusion List
sf data export --query "SELECT Id, Email FROM Contact WHERE In_HubSpot_Not_Inclusion_List__c = true" --target-org rentable-production --output-file inclusion-list-gaps.csv
```