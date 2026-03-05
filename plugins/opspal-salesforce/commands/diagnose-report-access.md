---
description: Diagnose and fix Salesforce report access issues by analyzing report type permission requirements
argument-hint: "[report-type] [--org <alias>] [--user <username>] [--permission-set <name>] [--fix]"
---

# /diagnose-report-access

Diagnose and fix Salesforce report access issues by analyzing report type permission requirements.

## Usage

```
/diagnose-report-access [report-type] [--org <alias>] [--user <username>] [--permission-set <name>] [--fix]
```

## When to Use

Use this command when:
- Users get "Insufficient Privileges" errors on reports
- Report folders are accessible but specific reports fail
- You need to verify permission coverage for report types
- Before deploying reports to validate permissions exist

## Common Issue This Solves

**Report types require Read permission on ALL objects the type CAN query, not just objects used in the data.**

Example: `CampaignWithCampaignMembers` requires Lead Read even when only querying Contact-based campaign members.

## Diagnostic Steps

When this command is invoked, perform these steps:

### 1. Identify the Problem Report Type

```bash
# If user provides report name/folder, find the report type
sf data query --query "SELECT Id, Name, ReportTypeApiName FROM Report WHERE Name LIKE '%$REPORT_NAME%'" --target-org $ORG_ALIAS --json
```

### 2. Analyze Report Type Requirements

```bash
# Use the report-type-analyzer to get all required permissions
node "$CLAUDE_PLUGIN_ROOT/scripts/lib/report-type-analyzer.js" \
  --report-type "$REPORT_TYPE" \
  --org "$ORG_ALIAS" \
  --validate \
  --json
```

### 3. Check Current User Permissions

```bash
# Get the user's effective permissions via their profile and permission sets
sf data query --query "
  SELECT Id, Profile.Name,
    (SELECT PermissionSet.Name FROM PermissionSetAssignments)
  FROM User
  WHERE Username = '$USERNAME'
" --target-org $ORG_ALIAS --json
```

### 4. Identify Permission Gaps

Compare required permissions against the user's actual permissions:

```bash
# Check each required object
for OBJECT in Campaign CampaignMember Lead Contact; do
  sf data query --query "
    SELECT SobjectType, PermissionsRead
    FROM ObjectPermissions
    WHERE ParentId IN (
      SELECT PermissionSetId FROM PermissionSetAssignment
      WHERE AssigneeId = '$USER_ID'
    )
    AND SobjectType = '$OBJECT'
  " --target-org $ORG_ALIAS --json
done
```

### 5. Generate Fix Recommendation

Based on the analysis, recommend one of:

1. **Add object to existing permission set**
   ```xml
   <objectPermissions>
       <allowRead>true</allowRead>
       <object>Lead</object>
   </objectPermissions>
   ```

2. **Create new dedicated permission set**
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/lib/report-type-analyzer.js" \
     --report-type "$REPORT_TYPE" \
     --org "$ORG_ALIAS" \
     --validate \
     --generate-xml
   ```

3. **Assign existing permission set to user**
   ```bash
   sf org assign permset --name Standard_Lead_Read --target-org $ORG_ALIAS
   ```

## Examples

### Example 1: Diagnose Campaign Report Access

```
User: /diagnose-report-access CampaignWithCampaignMembers --org acme-production

Expected output:
=== Report Type Analysis: CampaignWithCampaignMembers ===
Source: standard_mapping
Primary Object: Campaign

Required Permissions:
  - Campaign: Read
  - CampaignMember: Read
  - Lead: Read *** (commonly missed!)
  - Contact: Read

[NOTE] Lead Read is required even when only querying Contact-based members

=== User Permission Validation ===
Status: MISSING PERMISSIONS
Coverage: 75%

Missing Permissions:
  - Lead: Need Read, Has No Permission

=== Recommendation ===
Add Lead Read to the user's permission set or profile.

Quick Fix:
  sf org assign permset --name Standard_Lead_Read --target-org acme-production
```

### Example 2: Check Permission Set Coverage

```
User: /diagnose-report-access CampaignWithCampaignMembers --permission-set Campaign_Read_Only_Access --org acme-production

Expected output:
=== Permission Set Validation: Campaign_Read_Only_Access ===
Status: MISSING COVERAGE
Coverage: 75%

Missing from Permission Set:
  - Lead: Need Read

=== Recommended Addition ===
Add the following to Campaign_Read_Only_Access.permissionset-meta.xml:

<objectPermissions>
    <allowCreate>false</allowCreate>
    <allowDelete>false</allowDelete>
    <allowEdit>false</allowEdit>
    <allowRead>true</allowRead>
    <modifyAllRecords>false</modifyAllRecords>
    <object>Lead</object>
    <viewAllRecords>false</viewAllRecords>
</objectPermissions>
```

### Example 3: Auto-Fix Mode

```
User: /diagnose-report-access CampaignWithCampaignMembers --org acme-production --fix

If --fix is specified and issues are found:
1. Generate permission set XML with missing permissions
2. Deploy the permission set
3. Assign to affected users
4. Verify report is now accessible
```

## Known Report Type Requirements

Quick reference for commonly problematic report types:

| Report Type | Primary | Often-Missed Requirement |
|------------|---------|-------------------------|
| CampaignWithCampaignMembers | Campaign | Lead (even for Contact-only) |
| ActivityWithTask | Task | Lead, Opportunity (WhatId targets) |
| ActivityWithEvent | Event | Lead, Opportunity (WhatId targets) |
| OpportunityProduct | Opportunity | PricebookEntry, Product2 |
| LeadWithConvertedInfo | Lead | Account, Contact, Opportunity |

## Environment Variables

- `CLAUDE_PLUGIN_ROOT` - Plugin installation directory (auto-set by Claude Code)
- `SF_TARGET_ORG` - Default org alias if not specified

## Related Commands

- `/assess-permissions` - Full permission set assessment
- `/create-permission-set` - Create new permission sets
- `/audit-reports` - Report usage audit

## Related Agent

For complex permission issues, use the `sfdc-security-admin` agent:

```
Task(subagent_type='opspal-salesforce:sfdc-security-admin', prompt='Analyze and fix report access issue for CampaignWithCampaignMembers in acme-production')
```

## Reflection Reference

This command was created based on reflection ID: `8c999b22-5739-4ce8-8465-ade4fbea63d6`

Issue: SF report types require Read on ALL objects the type CAN query, not just objects in data. CampaignWithCampaignMembers requires Lead Read even for Contact-only data.
