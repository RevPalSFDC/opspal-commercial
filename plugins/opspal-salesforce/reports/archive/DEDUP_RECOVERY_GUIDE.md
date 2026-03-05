# SFDC Account Deduplication - Recovery Playbook

**Version**: 1.0.0
**Last Updated**: 2025-10-16

## Overview

This playbook covers recovery from Account merge errors using three specialized procedures:

- **Procedure A**: Field Restoration (Type 2 - Wrong Survivor)
- **Procedure B**: Entity Separation (Type 1 - Different Entities)
- **Procedure C**: Quick Undelete (Type 1 - Within 15 Days)

---

## Decision Tree: Which Procedure?

```
Is this a Type 1 or Type 2 error?
│
├─ TYPE 1 (Different Entities Merged)
│  │
│  ├─ Is deleted record in recycle bin (< 15 days)?
│  │  ├─ YES, need quick undo → Procedure C
│  │  └─ NO, or have many contacts → Procedure B
│  │
│  └─ Example: Two different Housing Authorities merged
│
└─ TYPE 2 (Same Entity, Wrong Survivor)
   │
   └─ Procedure A
   │
   └─ Example: Prospect absorbed Paying Customer
```

---

## Procedure A: Field Restoration

### When to Use

**Type 2 Error**: Same entity, but wrong survivor selected

**Examples**:
- Prospect account absorbed Paying Customer account
- Empty account absorbed Rich account with data
- Old account absorbed New account with recent activity

**Goal**: Restore superior field values from deleted record to survivor (non-destructive)

### Prerequisites

1. Deleted record still in Salesforce (merged within retention period)
2. Know the survivor Account ID
3. Org authenticated via Salesforce CLI

### Step-by-Step Execution

#### Step 1: Dry Run (REQUIRED)

```bash
cd .claude-plugins/opspal-salesforce/scripts/lib

node procedure-a-field-restoration.js {org} {survivor-id} --dry-run

# Example
node procedure-a-field-restoration.js production 001xx000ABC123 --dry-run
```

**What Happens**:
1. Queries deleted record with `MasterRecordId`
2. Queries current survivor record
3. Identifies fields to restore (auto-detects importance)
4. Generates Apex script for manual review
5. Generates rollback script

**Output**:
```
═══════════════════════════════════════════════════════════════════
FIELDS TO RESTORE
═══════════════════════════════════════════════════════════════════

1. Customer_Status__c (Customer Status)
   Type: picklist
   Reason: Superior status value
   Current (Survivor): Prospect
   Restore (Deleted): Paying Customer

2. Annual_Revenue__c (Annual Revenue)
   Type: currency
   Reason: Higher numeric value
   Current (Survivor): $50,000
   Restore (Deleted): $500,000

3. Last_Activity_Date__c (Last Activity Date)
   Type: date
   Reason: More recent date
   Current (Survivor): 2024-01-15
   Restore (Deleted): 2025-10-10

✅ Generated Apex script: restoration-scripts/restoration-001xx000ABC123-*.apex
✅ Generated rollback script: restoration-scripts/rollback-001xx000ABC123-*.apex
```

#### Step 2: Review Generated Scripts

```bash
# Review what will be restored
cat restoration-scripts/restoration-001xx000ABC123-*.apex
```

**Example Script**:
```apex
// Procedure A: Field Restoration Script
// Generated: 2025-10-16T12:00:00.000Z
// Org: production
// Survivor: ABC Corp (001xx000ABC123)
// Deleted: ABC Corp - Old (001xx000DEF456)

Account survivor = [SELECT Id, Customer_Status__c, Annual_Revenue__c, Last_Activity_Date__c
                    FROM Account WHERE Id = '001xx000ABC123'];

survivor.Customer_Status__c = 'Paying Customer'; // Superior status value
survivor.Annual_Revenue__c = 500000; // Higher numeric value
survivor.Last_Activity_Date__c = Date.valueOf('2025-10-10'); // More recent date

update survivor;
System.debug('Field restoration completed: ' + survivor);
```

#### Step 3: Execute Restoration

**Option A: Automatic Execution** (Recommended)

```bash
node procedure-a-field-restoration.js {org} {survivor-id}

# Example
node procedure-a-field-restoration.js production 001xx000ABC123
```

**What Happens**:
1. Generates CSV with field updates
2. Uses Salesforce Bulk API to update survivor
3. Verifies update success

**Option B: Manual Execution** (More Control)

```bash
# 1. Open Developer Console in Salesforce
# 2. Execute Anonymous
# 3. Paste contents of restoration script
# 4. Execute and verify
```

#### Step 4: Verify Results

```bash
# Query survivor to verify fields updated
sf data query --query "SELECT Id, Name, Customer_Status__c, Annual_Revenue__c FROM Account WHERE Id = '001xx000ABC123'" --target-org production
```

#### Step 5: Rollback (If Needed)

If restoration was incorrect:

```bash
# Open Developer Console
# Execute rollback script
cat restoration-scripts/rollback-001xx000ABC123-*.apex
```

### Selective Field Restoration

Restore only specific fields:

```bash
node procedure-a-field-restoration.js {org} {survivor-id} --fields Customer_Status__c,Annual_Revenue__c

# Example
node procedure-a-field-restoration.js production 001xx000ABC123 --fields Customer_Status__c,Revenue__c
```

### Success Criteria

- [ ] Deleted record queried successfully
- [ ] Survivor record queried successfully
- [ ] Important fields identified and restored
- [ ] Rollback script generated
- [ ] Field values verified in Salesforce UI

### Troubleshooting

**"No deleted record found"**:
- Check survivor ID is correct
- Check deleted record hasn't been purged (retention period)
- Query manually: `SELECT Id, Name, MasterRecordId FROM Account WHERE IsDeleted = true AND MasterRecordId = '{survivor-id}' ALL ROWS`

**"No fields to restore"**:
- Survivor may already have superior values
- Try specifying fields manually with `--fields`
- Check importance field detector results

---

## Procedure B: Entity Separation

### When to Use

**Type 1 Error**: Different entities were merged

**Examples**:
- Two different Housing Authorities in same city
- Different companies with similar names
- Parent company absorbed unrelated company

**Goal**: Separate entities + migrate child records by email domain

### Prerequisites

1. Deleted record still in Salesforce (merged within retention period)
2. Know the survivor Account ID
3. Org authenticated via Salesforce CLI
4. Time for interactive contact migration (10-30 min)

### Step-by-Step Execution

#### Step 1: Dry Run (REQUIRED)

```bash
cd .claude-plugins/opspal-salesforce/scripts/lib

node procedure-b-entity-separation.js {org} {survivor-id} --dry-run

# Example
node procedure-b-entity-separation.js production 001xx000ABC123 --dry-run
```

**What Happens**:
1. Queries deleted and survivor records
2. Simulates undelete (shows what would happen)
3. Queries all child records (Contacts, Opportunities, Cases)
4. Groups Contacts by email domain
5. Shows migration plan without executing

**Output**:
```
═══════════════════════════════════════════════════════════════════
CONTACT MIGRATION PLAN (Semi-Automatic)
═══════════════════════════════════════════════════════════════════

Survivor Account: Housing Authority of LA (001xx000ABC123)
Undeleted Account: Housing Authority of SF (001xx000DEF456)

───────────────────────────────────────────────────────────────────
CONTACTS GROUPED BY EMAIL DOMAIN
───────────────────────────────────────────────────────────────────

1. Domain: @housing-la.gov (5 contacts)
   - John Smith (john.smith@housing-la.gov) - Director
   - Jane Doe (jane.doe@housing-la.gov) - Manager
   ... and 3 more

2. Domain: @housing-sf.org (3 contacts)
   - Bob Johnson (bob.johnson@housing-sf.org) - Executive Director
   - Alice Williams (alice.williams@housing-sf.org) - CFO
   ... and 1 more

3. Domain: No Email (2 contacts)
   - Generic Contact (no email) - No Title
   - Unknown User (no email) - No Title

DRY RUN: Skipping actual undelete and migration
```

#### Step 2: Execute with Interactive Mode

```bash
node procedure-b-entity-separation.js {org} {survivor-id}

# Example
node procedure-b-entity-separation.js production 001xx000ABC123
```

**Interactive Prompts**:
```
For each domain group, choose migration target:
  S = Keep on Survivor account
  U = Move to Undeleted account
  M = Manual review (don't move)

@housing-la.gov (5 contacts) → Move to [S/U/M]? S
@housing-sf.org (3 contacts) → Move to [S/U/M]? U
No Email (2 contacts) → Move to [S/U/M]? M
```

**What Happens**:
1. Undeletes the merged record
2. For each domain group:
   - S: Contacts stay on Survivor
   - U: Contacts moved to Undeleted account via bulk CSV
   - M: Marked for manual review (no automatic migration)
3. Generates manual review guide for Opportunities/Cases

**Output**:
```
✅ Record undeleted: Housing Authority of SF
✅ Migrated 3 contacts to Housing Authority of SF
📄 Manual review guide: separation-guides/manual-review-*.md
```

#### Step 3: Manual Review of Opportunities/Cases

Open the generated guide:

```bash
cat separation-guides/manual-review-001xx000ABC123-*.md
```

**Guide Contents**:
- List of all Opportunities with current Account
- List of all Cases with current Account
- Checkboxes for manual reassignment
- Step-by-step reassignment instructions

**Manual Steps**:
1. Open Survivor Account in Salesforce
2. Go to Related → Opportunities
3. For each opportunity, edit Account field if needed
4. Repeat for Cases

#### Step 4: Verify Separation

```bash
# Check contacts on Survivor
sf data query --query "SELECT Id, Name, Email, Account.Name FROM Contact WHERE AccountId = '001xx000ABC123'" --target-org production

# Check contacts on Undeleted
sf data query --query "SELECT Id, Name, Email, Account.Name FROM Contact WHERE AccountId = '001xx000DEF456'" --target-org production
```

### Auto-Approve Mode

Skip interactive prompts (uses default strategy: all contacts stay on Survivor):

```bash
node procedure-b-entity-separation.js {org} {survivor-id} --auto-approve

# Example
node procedure-b-entity-separation.js production 001xx000ABC123 --auto-approve
```

Use this when:
- You want all contacts reviewed manually
- Running in automated pipeline
- Need quick undelete without complex migration

### Success Criteria

- [ ] Deleted record undeleted successfully
- [ ] Contacts grouped by email domain
- [ ] Domain→Account mappings approved
- [ ] Contacts migrated via bulk CSV
- [ ] Manual review guide generated
- [ ] Opportunities/Cases reviewed manually
- [ ] Both accounts verified in Salesforce UI

### Troubleshooting

**"Undelete failed"**:
- Record may be outside retention period
- Manual undelete: Setup → Recycle Bin → Find record → Undelete
- Continue with script after manual undelete

**"Contact migration failed"**:
- Check CSV file preserved: `separation-temp/migration-*.csv`
- Import manually via Data Loader
- Verify AccountId values are correct

**"No clear domain patterns"**:
- Use `--auto-approve` to skip automatic migration
- Review all contacts manually using generated guide

---

## Procedure C: Quick Undelete

### When to Use

**Type 1 Error** + **Within 15 Days** + **Need Quick Undo**

**Examples**:
- Merged wrong entities yesterday, need immediate undo
- Less than 10 contacts, simple migration
- Prefer manual review over automated contact migration

**Goal**: Quick undelete + manual review guide (no automated migration)

### Prerequisites

1. Deleted record in recycle bin (< 15 days since merge)
2. Know the survivor Account ID
3. Org authenticated via Salesforce CLI

### Step-by-Step Execution

#### Step 1: Execute Quick Undelete

```bash
cd .claude-plugins/opspal-salesforce/scripts/lib

node procedure-c-quick-undelete.js {org} {survivor-id}

# Example
node procedure-c-quick-undelete.js production 001xx000ABC123
```

**What Happens**:
1. Checks recycle bin window (warns if > 15 days)
2. Attempts undelete via CLI
3. Queries contacts and groups by domain (analysis only)
4. Generates quick separation guide
5. Generates contact migration CSV template

**Output**:
```
═══════════════════════════════════════════════════════════════════
PROCEDURE C: QUICK UNDELETE & SEPARATE
(Type 1 - Different Entities, Within 15-Day Window)
═══════════════════════════════════════════════════════════════════

✓ Deleted: 5 day(s) ago
✓ Found deleted record: Housing Authority of SF
✓ Found survivor record: Housing Authority of LA
✓ Record undeleted: Housing Authority of SF
✓ Found 8 contacts
✓ Generated quick guide: quick-guides/quick-separation-*.md
✓ Generated contact migration template: quick-templates/contact-migration-*.csv

═══════════════════════════════════════════════════════════════════
✅ PROCEDURE C COMPLETED
═══════════════════════════════════════════════════════════════════

📋 NEXT STEPS:
1. Open quick guide: quick-guides/quick-separation-001xx000ABC123-*.md
2. Review and migrate contacts by domain
3. Review and reassign opportunities
4. Review and reassign cases
5. Update integration systems if needed

⏱️ TIME REMAINING:
Deleted 5 day(s) ago → 10 day(s) left in recycle bin
```

#### Step 2: Follow Quick Guide

```bash
cat quick-guides/quick-separation-001xx000ABC123-*.md
```

**Guide Includes**:
- Status checklist
- Account comparison table
- Contact migration guide by domain
- Opportunity/Case manual steps
- Post-separation checklist

#### Step 3: Migrate Contacts

**Option A: Via Salesforce UI**
1. Open Survivor Account
2. Go to Related → Contacts
3. Edit each contact's Account field
4. Change to Undeleted Account where appropriate

**Option B: Via Data Loader**
1. Open contact migration template CSV
2. Update AccountId column (mark which contacts go to Undeleted account)
3. Update via Data Loader

**Option C: Via Procedure B**
If you realize you need interactive migration:

```bash
# Run Procedure B for semi-automatic contact migration
node procedure-b-entity-separation.js {org} {survivor-id}
```

### Dry Run Mode

Simulate without actually undeleting:

```bash
node procedure-c-quick-undelete.js {org} {survivor-id} --dry-run
```

Use this to:
- Check if record is in recycle bin
- See contact groupings before undeleting
- Verify time remaining in recycle bin window

### Success Criteria

- [ ] Recycle bin window checked (< 15 days)
- [ ] Record undeleted successfully
- [ ] Quick guide generated
- [ ] Contact migration template generated
- [ ] Contacts reviewed and reassigned
- [ ] Opportunities reviewed and reassigned
- [ ] Cases reviewed and reassigned

### Troubleshooting

**"Record outside 15-day window"**:
- Use Procedure B instead (doesn't require undelete via CLI)
- Contact Salesforce Support for special undelete

**"Undelete failed: CLI error"**:
- Manual undelete: Setup → Recycle Bin → Find record → Undelete
- Continue with generated guides after manual undelete

**"Too many contacts for manual review"**:
- Use Procedure B for semi-automatic contact migration by domain
- More efficient for 20+ contacts

---

## Comparison: Which Procedure?

| Factor | Procedure A | Procedure B | Procedure C |
|--------|-------------|-------------|-------------|
| **Error Type** | Type 2 | Type 1 | Type 1 |
| **Use Case** | Wrong survivor | Different entities | Different entities |
| **Complexity** | Simple | Complex | Simple |
| **Execution Time** | 5-10 min | 10-30 min | 5-10 min |
| **Contact Migration** | N/A | Semi-automatic | Manual |
| **Undelete Required** | No | Yes | Yes |
| **Recycle Bin Window** | Any | Any | < 15 days preferred |
| **Automation Level** | High | Medium | Low |
| **User Control** | Low | High | High |
| **Best For** | Field-level fixes | Many contacts | Quick undo |

---

## Post-Recovery Checklist

After any recovery procedure, complete these steps:

### Verification
- [ ] Both accounts exist and accessible
- [ ] All contacts correctly assigned
- [ ] All opportunities correctly assigned
- [ ] All cases correctly assigned
- [ ] No orphaned records

### Integration Updates
- [ ] Update external system IDs (if applicable)
- [ ] Update integration middleware mappings
- [ ] Notify integration team of ID changes

### User Communication
- [ ] Notify account owners of changes
- [ ] Update Chatter with separation notes
- [ ] Add notes to Account records explaining separation

### Documentation
- [ ] Document reason for separation
- [ ] Save recovery guide for future reference
- [ ] Update dedup configuration if pattern detected

### Prevention
- [ ] Add to generic entity patterns (if applicable)
- [ ] Update importance field keywords (if applicable)
- [ ] Run analysis on remaining duplicates

---

## Recovery Workflow Examples

### Example 1: Prospect Absorbed Customer (Type 2)

**Situation**: Prospect account absorbed Paying Customer account

**Steps**:
```bash
# 1. Dry run to see what will be restored
node procedure-a-field-restoration.js production 001xx000ABC --dry-run

# 2. Review generated script
cat restoration-scripts/restoration-001xx000ABC-*.apex

# 3. Execute restoration
node procedure-a-field-restoration.js production 001xx000ABC

# 4. Verify in Salesforce
sf data query --query "SELECT Id, Name, Customer_Status__c FROM Account WHERE Id = '001xx000ABC'" --target-org production

# 5. Complete
```

**Time**: 5 minutes
**Risk**: Low (non-destructive, rollback available)

---

### Example 2: Two Housing Authorities Merged (Type 1)

**Situation**: Housing Authority of LA absorbed Housing Authority of SF

**Steps**:
```bash
# 1. Dry run to see separation plan
node procedure-b-entity-separation.js production 001xx000ABC --dry-run

# 2. Execute with interactive migration
node procedure-b-entity-separation.js production 001xx000ABC

# Interactive prompts:
#   @housing-la.gov (5 contacts) → Move to [S/U/M]? S
#   @housing-sf.org (3 contacts) → Move to [S/U/M]? U
#   No Email (2 contacts) → Move to [S/U/M]? M

# 3. Review manual guide
cat separation-guides/manual-review-001xx000ABC-*.md

# 4. Manually reassign opportunities and cases in Salesforce UI

# 5. Verify separation
sf data query --query "SELECT Id, Name, Account.Name FROM Contact WHERE AccountId IN ('001xx000ABC', '001xx000DEF')" --target-org production

# 6. Complete
```

**Time**: 15-20 minutes
**Risk**: Medium (requires manual review of opportunities/cases)

---

### Example 3: Wrong Merge Yesterday (Type 1, Quick Undo)

**Situation**: Merged wrong accounts yesterday, need quick undo

**Steps**:
```bash
# 1. Quick undelete
node procedure-c-quick-undelete.js production 001xx000ABC

# 2. Follow generated guide
cat quick-guides/quick-separation-001xx000ABC-*.md

# 3. Use contact migration template
#    Open: quick-templates/contact-migration-001xx000ABC-*.csv
#    Edit: Update AccountId column for contacts that should move
#    Import: Via Data Loader

# 4. Manually review opportunities and cases

# 5. Complete
```

**Time**: 10 minutes
**Risk**: Low (within recycle bin window, simple undo)

---

## Best Practices

### 1. Always Dry Run First

```bash
# NEVER skip dry run for Procedures A and B
node procedure-a-field-restoration.js {org} {id} --dry-run
node procedure-b-entity-separation.js {org} {id} --dry-run
```

### 2. Save All Generated Files

Keep backups of:
- Restoration scripts (`restoration-scripts/`)
- Rollback scripts (`restoration-scripts/rollback-*`)
- Separation guides (`separation-guides/`)
- Quick guides (`quick-guides/`)

### 3. Test in Sandbox First

If possible, replicate the error in sandbox and test recovery procedure before production.

### 4. Document Recovery

Add notes to Account records:
```
Chatter Post:
"[2025-10-16] Entity separation completed. This account was previously merged with [Account Name]. Contacts with @domain.com reassigned. See separation guide: [link]"
```

### 5. Update Prevention

After recovery, update configuration to prevent recurrence:
- Add generic entity patterns
- Adjust guardrail thresholds
- Update importance field keywords

---

## Emergency Contacts

If recovery procedures fail:

1. **Salesforce Support**: For special undelete requests (outside 15-day window)
2. **Database Admin**: For direct database recovery (last resort)
3. **Integration Team**: For external system ID updates

---

**Version**: 1.0.0
**Last Updated**: 2025-10-16
**Maintained By**: RevPal Engineering
