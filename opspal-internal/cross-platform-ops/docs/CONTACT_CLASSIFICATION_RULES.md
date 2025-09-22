# Contact Classification Rules Documentation

## Overview
This document defines the business rules for contact data quality classification in Salesforce.

## Classification Status Values

### 1. OK ✅
**Definition**: Contact is valid and should remain active in the system.

**Rules**:
- Has valid email OR phone number
- Has recent activity (within last 3 years) OR created recently
- Not identified as duplicate
- Not marked as test/placeholder

**Field Requirements**:
- `Clean_Status__c` = 'OK'
- `Delete_Reason__c` = '' (MUST be blank)
- `Sync_Status__c` = (preserved or set based on HubSpot presence)

### 2. Delete 🗑️
**Definition**: Contact should be removed from active use.

**Rules** (any of these trigger Delete status):
1. **No Contact Info**: No email AND no phone/mobile
2. **Test/Placeholder**: Name or email contains test patterns
3. **No Activity 3+ Years**: Created ≥3 years ago with no LastActivityDate
4. **Inactive 3+ Years**: LastActivityDate ≥3 years ago
5. **No-Reply Domains**: Email from noreply/donotreply domains

**Field Requirements**:
- `Clean_Status__c` = 'Delete'
- `Delete_Reason__c` = (specific reason from rules above)
- `Sync_Status__c` = 'Not Synced'

### 3. Archive 📦
**Definition**: Contact is old but may have historical value.

**Rules**:
- Created ≥5 years ago
- AND (no activity OR last activity ≥2 years ago)
- But doesn't meet Delete criteria

**Field Requirements**:
- `Clean_Status__c` = 'Archive'
- `Delete_Reason__c` = 'Old Inactive Contact'
- `Sync_Status__c` = (preserved)

### 4. Duplicate 👥
**Definition**: Contact is a duplicate of another record.

**Detection Methods**:
- **High Confidence**: Same email OR same phone
- **Low Confidence**: Same name + same AccountId

**Master Selection** (in order of priority):
1. Highest contact score (based on data completeness)
2. Most recently modified
3. Oldest created (as tie-breaker)

**Field Requirements**:
- `Clean_Status__c` = 'Duplicate'
- `Delete_Reason__c` = 'Master: [MasterContactId]'
- `Sync_Status__c` = 'Not Synced'

### 5. Review ⚠️
**Definition**: Contact needs manual review.

**Rules**:
- Missing critical info (LastName or contact method)
- Email opt-out or bounce
- Low-confidence duplicate (name+company only)
- Data quality concerns

**Field Requirements**:
- `Clean_Status__c` = 'Review'
- `Delete_Reason__c` = (specific issue)
- `Sync_Status__c` = 'Not Synced'

## Edge Cases & Known Issues

### Issue 1: OK Status with Delete_Reason
**Problem**: Some OK contacts had Delete_Reason populated.
**Root Cause**: Classification logic didn't explicitly clear Delete_Reason when setting OK status.
**Fix**: Updated logic to always clear Delete_Reason for OK status.

### Issue 2: Missing Delete Reasons
**Problem**: Delete status contacts without Delete_Reason.
**Root Cause**: Initial processing didn't populate all reasons.
**Fix**: Retroactive update script to populate missing reasons.

### Issue 3: Duplicate Detection Accuracy
**Problem**: Some duplicates only matched on name+company (low confidence).
**Solution**: These are marked as 'Review' instead of 'Duplicate'.

### Issue 4: Archive vs Delete Boundary
**Challenge**: Determining when old contacts should be archived vs deleted.
**Current Rule**: Archive if 5+ years old but had some activity; Delete if no value.

## Contact Scoring Algorithm

```javascript
Score = 0
+ 10 points: Has Email
+ 8 points:  Has Phone
+ 5 points:  Has MobilePhone
+ 5 points:  Has AccountId
+ 5 points:  Has HubSpot_Contact_ID__c
+ 10 points: Has LastActivityDate
+ 3 points:  Has FirstName
+ 3 points:  Has LastName
+ 2 points:  Has Title
+ 2 points:  Has Department
+ 1 point:   Has MailingCity
+ 1 point:   Has MailingState
```

## Test Patterns

### Name Patterns (case-insensitive):
- test
- demo
- fake
- example
- placeholder
- dummy
- sample

### Email Domain Patterns:
- @test.*
- @example.*
- @placeholder.*
- @demo.*
- @fake.*
- @noreply.*
- @no-reply.*
- @donotreply.*
- @spam.*
- @junk.*

## Field Validation Rules

### Mutually Exclusive States:
- If `Clean_Status__c` = 'OK' → `Delete_Reason__c` MUST be blank
- If `Clean_Status__c` = 'Delete' → `Delete_Reason__c` MUST have value
- If `Clean_Status__c` = 'Archive' → `Delete_Reason__c` SHOULD have value
- If `Clean_Status__c` = 'Duplicate' → `Delete_Reason__c` MUST contain 'Master:'

### Sync Status Rules:
- Delete/Duplicate/Review → Always 'Not Synced'
- OK/Archive → Preserve existing or set based on HubSpot presence
- Null → Should be set to 'Not Synced' as default

## Processing Order

1. **Export all contacts** (CSV for large datasets)
2. **Build duplicate graph** (union-find algorithm)
3. **Select masters** (scoring algorithm)
4. **Classify each contact** (apply rules in order)
5. **Validate picklist values**
6. **Batch upload** (10,000 records per batch)
7. **Verify results** (validation script)

## Monitoring & Validation

Run validation script regularly:
```bash
node scripts/contact-data-validator.js
```

Key metrics to monitor:
- OK contacts without email: Should be minimal
- Delete contacts without reason: Should be 0
- OK contacts with Delete_Reason: Should be 0
- Unclassified contacts: Should be 0

## Future Improvements

1. **Machine Learning Classification**
   - Train model on manually reviewed contacts
   - Predict classification for edge cases
   - Improve duplicate detection accuracy

2. **Real-time Processing**
   - Trigger-based classification on record create/update
   - Immediate duplicate detection
   - Async processing for large batches

3. **Enhanced Duplicate Detection**
   - Fuzzy name matching
   - Company name normalization
   - Email domain aliasing
   - Phone number formatting

4. **Activity-Based Scoring**
   - Weight recent activity higher
   - Consider engagement metrics
   - Include opportunity/case associations

---

Last Updated: 2025-09-21
Version: 1.0