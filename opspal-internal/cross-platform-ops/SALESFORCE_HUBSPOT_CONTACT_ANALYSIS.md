# Salesforce vs HubSpot Contact Discrepancy Analysis
## Comprehensive Investigation Report with Data Marking Strategy

---

## Executive Summary

### Key Findings
- **Salesforce**: 254,176 total contacts
- **HubSpot**: 59,365 total contacts
- **Ratio**: 4.28:1 (Salesforce has 428% more contacts than HubSpot)
- **Sync Status**: Only 1,281 contacts (0.5%) are synced between systems
- **Inclusion List**: Only 1,382 contacts (2.3% of HubSpot) are on the inclusion list
- **Critical Issue**: 97.7% of HubSpot contacts are NOT on the Inclusion List

### Recommended Approach
Instead of immediate deletion or merging, implement a **Clean Status** field in Salesforce to mark records for review with customer approval before any permanent changes.

---

## Part 1: Contact Count Discrepancy - Root Causes

### 1.1 Data Quality Issues (63,521 contacts affected - 25% of database)

#### Missing Email Addresses (39,378 contacts - 15.5%)
**Sample Records:**
| Contact ID | Name | Created Date | Issue |
|------------|------|--------------|-------|
| 0032A00002OvFZdQAN | Mikaela Parker | 2016-09-20 | No email address |
| 0032A00002OwAo5QAF | Melissa Pearce | 2016-09-23 | No email address |
| 0032A00002OxlvyQAB | Cathie Banta | 2016-09-26 | No email address |
| 0032A00002OyLukQAF | Stuart . | 2016-09-28 | No email, placeholder name |
| 0032A00002PTQHoQAP | Anna Long | 2016-10-04 | No email address |

**Recommended Clean Status**: `Delete` (cannot sync without email)

#### Placeholder Names (5,408 contacts - 2.1%)
**Sample Records with "." as Last Name:**
| Contact ID | Name | Email | Created By |
|------------|------|-------|------------|
| 0032A00002Ovoa4QAB | Amy . | amy@rentgainesville.com | Ethan Steinhoff |
| 0032A00002OyLukQAF | Stuart . | (no email) | Todd Lippman |
| 0032A00002OyzIKQAZ | Kara . | khahus@univhousing.com | Ethan Steinhoff |
| 0032A00002PTB42QAH | Beth . | frontdesk@campusrealty.com | Todd Lippman |
| 0032A00002PTTWIQA5 | Alex . | alex@pavprop.com | Todd Lippman |

**Recommended Clean Status**: `Delete` or `Merge` (if real person can be identified)

#### Missing Phone Numbers (48,091 contacts - 18.9%)
- Contacts without any phone number (Phone or MobilePhone)
- **Recommended Clean Status**: `OK` (if has email) or `Delete` (if no contact method)

#### Missing Lead Source (251,865 contacts - 99.1%)
- Nearly all contacts lack lead source tracking
- **Recommended Clean Status**: `OK` (add lead source during cleanup)

---

### 1.2 Duplicate Records

#### Email Duplicates - Highest Count Examples
**hannah@thedelscorp.com - 6 duplicate records:**
| Contact ID | Name | Clean Status | Merge Candidates |
|------------|------|--------------|------------------|
| 003Rh00000XOzdxIAD | Paris Anderson | Merge | 003Rh00000XP0m8IAD;003Rh00000XOzf3IAD;003Rh00000XP0VqIAL |
| 003Rh00000XOzf3IAD | Mark Bertel | Merge | 003Rh00000XP0m8IAD;003Rh00000XOzdxIAD;003Rh00000XP0VqIAL |
| 003Rh00000XP0VqIAL | Abbie Poche | Merge | 003Rh00000XP0m8IAD;003Rh00000XOzdxIAD;003Rh00000XOzf3IAD |
| 003Rh00000XP0l3IAD | Jacque Soileau | Merge | 003Rh00000XP0m8IAD;003Rh00000XP0l4IAD |
| 003Rh00000XP0l4IAD | Marc Soileau | Merge | 003Rh00000XP0m8IAD;003Rh00000XP0l3IAD |
| 003Rh00000XP0m8IAD | Hannah Thaxton | OK | (Primary - keep this one) |

**Other Duplicate Examples:**
- **apartments@hmgapt.com**: 4 duplicates - Clean Status: `Merge`
- **ashley.shelite@indiomgmt.com**: 3 duplicates - Clean Status: `Merge`
- **katie.garay@ccinvest.com**: 3 duplicates - Clean Status: `Merge`
- **josh@rise48equity.com**: 3 duplicates - Clean Status: `Merge`

---

### 1.3 Mass Data Imports (194,177 contacts - 76% of database)

#### NuAge Experts Import (81,264 contacts - 32% of total)
**Sample from April 23, 2022 Batch:**
| Contact ID | Name | Email | Import Time |
|------------|------|-------|-------------|
| 0033j00003wOSPQAA4 | Amanda Velazquez | avelazquez@clsliving.com | 2022-04-23 11:04:28 |
| 0033j00003wOSSZAA4 | Andres Jaimes Garcia | ajaimesgarcia@clsliving.com | 2022-04-23 11:05:48 |
| 0033j00003wOSSaAAO | Andrew Raines | araines@clsliving.com | 2022-04-23 11:05:48 |
| 0033j00003wOSSbAAO | Anthony Rogers | arogers@clsliving.com | 2022-04-23 11:05:48 |
| 0033j00003wOSScAAO | April Casaday | acasaday@clsliving.com | 2022-04-23 11:05:48 |

**Pattern**: All @clsliving.com domain, imported simultaneously
**Recommended Clean Status**: Review for `OK`, `Merge`, or `Delete` based on activity

#### Top Data Import Sources
| User | Contacts Created | Percentage | Recommended Action |
|------|-----------------|------------|-------------------|
| NuAge Experts | 81,264 | 32.0% | Review for quality |
| Anida Ho | 39,590 | 15.6% | Review for duplicates |
| User 0053j000008brpdAAA | 35,695 | 14.0% | Identify user and review |
| User 0053j00000B2lByAAJ | 26,728 | 10.5% | Identify user and review |
| User 0053j00000A1gOpAAJ | 10,900 | 4.3% | Identify user and review |

---

### 1.4 Historical Data Accumulation

#### Oldest Contacts (Created 2014)
| Contact ID | Name | Email | Created | Last Modified | Clean Status |
|------------|------|-------|---------|---------------|--------------|
| 003F000001L8GLoIAN | Kim Watkins | kim@manhattangmat.com | 2014-03-08 | 2014-11-06 | Delete (inactive 10+ years) |
| 003F000001KFbxrIAD | Devon Creurer | dcreurer@arcadiamanagement.com | 2014-03-09 | 2024-01-06 | OK (recent activity) |
| 003F000001KFcN3IAL | John Bear | (no email) | 2014-03-09 | 2014-03-09 | Delete (no email, never modified) |
| 003F000001KFcNAIA1 | Adam Frey | adam@goldleafdevelopment.com | 2014-03-09 | 2024-11-12 | OK (recent activity) |
| 003F000001KFcNHIA1 | Annie Collins | annie@goldleafdevelopment.com | 2014-03-09 | 2025-08-08 | OK (recent activity) |

#### Age Distribution Analysis
| Period | Count | Percentage | Recommended Action |
|--------|-------|------------|-------------------|
| Pre-2020 | 53,572 | 21.1% | Mark for archive review |
| 2020-2023 | 167,964 | 66.1% | Review for activity |
| 2024-2025 | 32,640 | 12.8% | Keep active |
| Modified in 2025 | 71,262 | 28.0% | Keep active |

---

## Part 2: Sync Status Analysis

### 2.1 Current Integration State

#### Sync Overview
| Metric | Count | Percentage | Issue |
|--------|-------|------------|-------|
| SF Contacts with HS ID | 0 | 0% | No HS ID field in Salesforce |
| HS Contacts with SF ID | 1,281 | 2.2% | Minimal sync coverage |
| Contacts in Both Systems | 1,281 | 0.5% of SF | No active sync |
| Orphaned in Salesforce | 252,895 | 99.5% | Not in HubSpot |
| Orphaned in HubSpot | 58,084 | 97.8% | Not in Salesforce |

### 2.2 Synced Contact Examples
| HubSpot Email | Salesforce ID | Last Sync | Status |
|---------------|---------------|-----------|---------|
| j.jackovich@amcllc.net | 0033j000041CAFQAA4 | 2025-09-08 | Active |
| lisa.clark@olympusproperty.com | 0032A00002azrSKQAY | 2025-09-15 | Active |
| mark_conner@edwardrose.com | 0033j000049FiqdAAC | 2025-09-15 | Active |
| jsweeney@avenue5.com | 003Rh00000CjDQTIA3 | 2025-09-19 | Active |
| downtown@camdenliving.com | 0033j00003wPBncAAG | 2025-05-11 | Active |
| joel@elevatecig.com | 003Rh000006LLveIAG | 2024-12-09 | Stale |

**Note**: Salesforce IDs persist in HubSpot even after SF record is merged/deleted

### 2.3 HubSpot Inclusion List Analysis

#### List Configuration
- **List Name**: Inclusion List
- **List ID**: 26
- **Type**: Dynamic (auto-updates based on criteria)
- **Created**: May 1, 2024
- **Last Updated**: May 26, 2025
- **Current Size**: 1,382 contacts

#### Coverage Analysis
| Metric | Count | Percentage | Issue |
|--------|-------|------------|-------|
| Total HubSpot Contacts | 59,365 | 100% | - |
| In Inclusion List | 1,382 | 2.3% | Too restrictive |
| NOT in Inclusion List | 57,983 | 97.7% | Missing from sync |
| Have Salesforce ID | 1,281 | 2.2% | Minimal integration |

### 2.4 HubSpot Independent Contacts
**Sample Records WITHOUT Salesforce ID:**
| Name | Email | Created | Type |
|------|-------|---------|------|
| Maria Johnson | emailmaria@hubspot.com | 2023-12-28 | Sample Contact |
| Brian Halligan | bh@hubspot.com | 2023-12-28 | Sample Contact |
| Emily Thomas | emthomas@americancampus.com | 2024-01-20 | Real Contact |
| Annalie Ceballos | annalie.ceballos@colliers.com | 2024-01-20 | Real Contact |
| Krystle Coleman | kcoleman@thesciongroup.com | 2024-01-20 | Real Contact |

### 2.5 Available Salesforce Sync Fields in HubSpot
| Field Name | Purpose | Current Usage |
|------------|---------|---------------|
| salesforceaccountid | Link to SF Account | Minimal |
| salesforcecampaignids | Campaign membership | Minimal |
| salesforcecontactid | Primary sync field | 1,281 records |
| salesforcedeleted | Deletion flag | Not used |
| salesforcelastsynctime | Sync timestamp | Active for 1,281 |
| salesforceleadid | Lead record link | Minimal |
| salesforceopportunitystage | Opp stage tracking | Minimal |
| salesforceownerid | Owner sync | Minimal |

---

## Part 3: Proposed Data Cleanup Strategy

### 3.1 New Salesforce Fields Required

#### Clean_Status__c (Picklist)
**Values:**
- `OK` - Record is valid and should remain
- `Merge` - Duplicate record, should be merged
- `Delete` - Invalid/obsolete record, should be deleted
- `Archive` - Historical record, move to archive
- `Review` - Needs manual review

#### Merge_Candidates__c (Long Text)
- Semicolon-separated list of Contact IDs
- Example: `003Rh00000XP0m8IAD;003Rh00000XOzf3IAD;003Rh00000XP0VqIAL`

#### Data_Quality_Score__c (Number)
- 0-100 score based on completeness
- Factors: Email, Phone, Name, Activity, Lead Source

#### Sync_Status__c (Picklist)
**Values:**
- `Synced` - Active sync with HubSpot
- `Not Synced` - Not in HubSpot
- `Sync Error` - Sync attempted but failed
- `Excluded` - Intentionally excluded from sync

---

## Part 4: Implementation Plan

### Phase 1: Field Creation & Data Marking (Week 1)

#### Step 1.1: Create Custom Fields
```
1. Clean_Status__c (Picklist)
2. Merge_Candidates__c (Long Text Area - 32,000 chars)
3. Data_Quality_Score__c (Number, 0 decimals)
4. Sync_Status__c (Picklist)
5. HubSpot_Contact_ID__c (Text - 18 chars)
```

#### Step 1.2: Initial Data Marking Rules
```sql
-- Mark contacts without email
UPDATE Contact
SET Clean_Status__c = 'Delete'
WHERE Email = null

-- Mark placeholder names
UPDATE Contact
SET Clean_Status__c = 'Delete'
WHERE LastName IN ('.', '_', '-', 'test', 'Test', 'TEST')

-- Mark old inactive contacts
UPDATE Contact
SET Clean_Status__c = 'Archive'
WHERE CreatedDate < '2020-01-01'
  AND LastModifiedDate < '2022-01-01'

-- Mark duplicates (requires Apex/Flow for complex logic)
```

### Phase 2: Customer Review Process (Week 2-3)

#### Step 2.1: Generate Review Reports
**Report 1: Proposed Deletions**
- All records marked `Clean_Status__c = 'Delete'`
- Group by reason (no email, placeholder name, etc.)
- Total: ~45,000 records

**Report 2: Proposed Merges**
- All records marked `Clean_Status__c = 'Merge'`
- Show merge candidates for each
- Total: ~2,000 records

**Report 3: Proposed Archives**
- All records marked `Clean_Status__c = 'Archive'`
- Show last activity date
- Total: ~50,000 records

#### Step 2.2: Customer Approval Workflow
1. Export reports to Excel for customer review
2. Customer marks approved/rejected for each batch
3. Update Clean_Status__c based on feedback
4. Document approval in custom object

### Phase 3: Sync Expansion (Week 4-5)

#### Step 3.1: Expand HubSpot Inclusion List
**Current Criteria** (1,382 contacts):
- Unknown/too restrictive

**Proposed Criteria** (target 25,000 contacts):
```
Include if ALL of:
- Has email address
- Clean_Status__c = 'OK'
- Created or Modified in last 3 years

AND ANY of:
- Has Account association
- Has Opportunity
- Has Activity in last year
- Lead Score > 0
```

#### Step 3.2: Implement Bidirectional Sync
1. Add HubSpot_Contact_ID__c to Salesforce
2. Configure field mappings
3. Set up real-time sync triggers
4. Implement error handling

### Phase 4: Execution (Week 6-8)

#### Step 4.1: Data Cleanup Execution
**Order of Operations:**
1. Archive historical records (after approval)
2. Merge duplicates (after approval)
3. Delete invalid records (after approval)
4. Update data quality scores
5. Populate sync status

#### Step 4.2: Sync Rollout
**Progressive Sync Schedule:**
| Week | Target | Count | Criteria |
|------|--------|-------|----------|
| 6 | High Value | 10,000 | Recent activity, has opportunity |
| 7 | Medium Value | 15,000 | Modified in 2024-2025 |
| 8 | Standard | 25,000 | All meeting inclusion criteria |

### Phase 5: Monitoring & Governance (Ongoing)

#### Key Metrics to Track
| Metric | Current | 30-Day Target | 90-Day Target |
|--------|---------|---------------|---------------|
| Total SF Contacts | 254,176 | 220,000 | 150,000 |
| Synced Contacts | 1,281 | 10,000 | 35,000 |
| Sync Rate | 0.5% | 4.5% | 23% |
| Data Quality Score | ~65% | 75% | 85% |
| Duplicate Rate | 1% | 0.5% | 0.1% |
| Email Coverage | 84.5% | 90% | 95% |

#### Ongoing Processes
- **Weekly**: Sync health check, new duplicate scan
- **Monthly**: Data quality report, merge review
- **Quarterly**: Archive review, sync optimization
- **Annually**: Full data audit, historical cleanup

---

## Part 5: Technical Implementation Guide

### 5.1 Salesforce Configuration

#### Apex Trigger for Duplicate Detection
```apex
trigger ContactDuplicateMarker on Contact (before insert, before update) {
    // Check for duplicate emails
    // Populate Merge_Candidates__c field
    // Set Clean_Status__c = 'Merge'
}
```

#### Flow for Data Quality Scoring
```
Calculate score based on:
- Has Email: +30 points
- Has Phone: +20 points
- Has Complete Name: +20 points
- Has Lead Source: +10 points
- Has Account: +10 points
- Recent Activity: +10 points
```

### 5.2 Cross-Platform Operations Suite Usage

#### Available Commands for Implementation
```bash
# Analyze current state
npm run xplat:analyze -p both --export csv

# Find duplicates
npm run xplat:dedupe -p salesforce --dry-run --export duplicates.csv

# Check sync status
npm run xplat:sync --dry-run --validate

# Expand inclusion list
npm run xplat:map --auto-detect --criteria "email != null"
```

#### Monitoring Dashboard Configuration
```javascript
{
  "metrics": {
    "totalContacts": { "salesforce": 254176, "hubspot": 59365 },
    "syncedContacts": 1281,
    "inclusionList": 1382,
    "dataQuality": {
      "withEmail": 214798,
      "withPhone": 206085,
      "complete": 165000
    }
  },
  "alerts": {
    "syncFailure": true,
    "duplicateThreshold": 100,
    "qualityThreshold": 70
  }
}
```

---

## Part 6: Risk Mitigation

### 6.1 Potential Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Accidental deletion of valid contacts | High | Mark only, require approval before delete |
| Merging wrong contacts | Medium | Show all fields for review, test with small batch |
| Sync overload | Medium | Progressive rollout, monitor API limits |
| Customer disagreement | Low | Detailed reports, iterative approval process |
| Orphaned references | Low | Validate all SF IDs in HubSpot before cleanup |

### 6.2 Rollback Plan

1. **Before Any Changes**:
   - Full backup of Contact object
   - Export all Contact IDs and Clean_Status__c values
   - Document current sync status

2. **Rollback Procedures**:
   - Undelete records (Salesforce Recycle Bin - 15 days)
   - Restore from backup for merges
   - Disable sync if issues occur
   - Revert Inclusion List criteria

---

## Part 7: Success Criteria

### 7.1 Short-term Success (30 days)
- [ ] Clean_Status__c populated for 100% of contacts
- [ ] Customer approval for 80%+ of proposed changes
- [ ] 10,000+ contacts marked as 'OK' and synced
- [ ] Inclusion List expanded to 10,000+ contacts
- [ ] Zero data loss incidents

### 7.2 Long-term Success (90 days)
- [ ] Salesforce contacts reduced to <180,000
- [ ] 35,000+ contacts actively synced
- [ ] 85%+ data quality score average
- [ ] <0.5% duplicate rate
- [ ] Automated governance processes in place

---

## Appendices

### Appendix A: SQL Queries for Analysis

```sql
-- Find all duplicates by email
SELECT Email, COUNT(*) as DupeCount,
       GROUP_CONCAT(Id, ';') as ContactIDs,
       GROUP_CONCAT(Name, ';') as Names
FROM Contact
WHERE Email != null
GROUP BY Email
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC

-- Find contacts for archive
SELECT Id, Name, Email, CreatedDate, LastModifiedDate
FROM Contact
WHERE CreatedDate < '2020-01-01'
  AND LastModifiedDate < '2022-01-01'
  AND (LastActivityDate < '2022-01-01' OR LastActivityDate IS NULL)

-- Calculate data quality
SELECT
  CASE
    WHEN Email != null AND Phone != null AND LeadSource != null THEN 'High'
    WHEN Email != null AND (Phone != null OR LeadSource != null) THEN 'Medium'
    WHEN Email != null THEN 'Low'
    ELSE 'Invalid'
  END as QualityLevel,
  COUNT(*) as ContactCount
FROM Contact
GROUP BY QualityLevel
```

### Appendix B: Customer Approval Template

**Contact Cleanup Approval Form**

| Batch ID | Record Count | Action Type | Business Justification | Approved By | Date | Notes |
|----------|--------------|-------------|----------------------|-------------|------|-------|
| BATCH-001 | 39,378 | Delete | No email address | | | |
| BATCH-002 | 5,408 | Delete | Placeholder names | | | |
| BATCH-003 | 2,000 | Merge | Duplicate emails | | | |
| BATCH-004 | 53,572 | Archive | Pre-2020 inactive | | | |

### Appendix C: Post-Implementation Checklist

- [ ] All Clean_Status__c fields populated
- [ ] Customer approvals documented
- [ ] Backup completed and verified
- [ ] Sync monitoring dashboard active
- [ ] Alert thresholds configured
- [ ] Team training completed
- [ ] Rollback procedure tested
- [ ] Success metrics baselined

---

## Next Steps

1. **Immediate Actions**:
   - Review this analysis with stakeholders
   - Get approval for field creation
   - Schedule customer review sessions

2. **Week 1 Deliverables**:
   - Create custom fields in Salesforce
   - Run initial data marking process
   - Generate first review reports

3. **Communication Plan**:
   - Weekly status updates to stakeholders
   - Dashboard for real-time monitoring
   - Escalation path for issues

---

**Document Version**: 1.0
**Created**: 2025-09-20
**Author**: Cross-Platform Operations Team
**Status**: DRAFT - Pending Review

---

*This document contains real data samples from production systems. Handle with appropriate security measures.*