# Contact Marking Scheduled Flow Configuration
**No deployment needed - Create directly in Setup**

## Flow Setup Instructions

### 1. Create Scheduled-Triggered Flow
1. Go to Setup → Flows → New Flow
2. Choose "Scheduled-Triggered Flow"
3. Set Schedule:
   - Start Date: Today
   - Frequency: Daily (or Hourly if urgent)
   - Time: Off-peak hours (e.g., 2 AM)

### 2. Get Records Element
**Label**: Get Unmarked Contacts
**Object**: Contact
**Filter Conditions**:
```
Email != null
AND (Clean_Status__c = null OR Sync_Status__c = null)
```
**How Many Records**: Up to 200 records
**Sort**: By Id Ascending

### 3. Decision Element: Calculate Quality Score
**Label**: Determine Clean Status
Create multiple outcomes:

**Outcome 1: High Quality**
- Email is not null (always true from filter)
- AND (Phone is not null OR MobilePhone is not null)
- AND AccountId is not null
- AND Name != "Unknown"
→ Set Clean_Status__c = "OK"

**Outcome 2: Low Quality**
- Email is not null
- AND Phone is null
- AND MobilePhone is null
- AND AccountId is null
→ Set Clean_Status__c = "Delete"

**Default Outcome**:
→ Set Clean_Status__c = "Review"

### 4. Update Records Elements

**For High Quality Path**:
- Update Records: {!Get_Unmarked_Contacts}
- Set Field Values:
  - Clean_Status__c = "OK"
  - Sync_Status__c = "Synced" (if HubSpot_Contact_ID__c != null)
  - Sync_Status__c = "Not Synced" (if HubSpot_Contact_ID__c = null)

**For Low Quality Path**:
- Update Records: {!Get_Unmarked_Contacts}
- Set Field Values:
  - Clean_Status__c = "Delete"
  - Sync_Status__c = "Not Synced"

**For Default Path**:
- Update Records: {!Get_Unmarked_Contacts}
- Set Field Values:
  - Clean_Status__c = "Review"
  - Sync_Status__c = "Not Synced"

### 5. Activate Flow
- Save As: "Contact_Marking_Scheduled_Flow"
- Activate immediately

## Monitoring
- Check Setup → Scheduled Jobs to see next run
- View results in Setup → Flow Interview Log
- Query progress:
```sql
SELECT Clean_Status__c, COUNT(Id)
FROM Contact
WHERE Clean_Status__c != null
GROUP BY Clean_Status__c
```