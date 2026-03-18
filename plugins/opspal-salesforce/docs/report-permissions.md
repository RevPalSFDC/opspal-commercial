# Report Type Permissions Guide

This document explains how to diagnose and resolve Salesforce report access issues, particularly the "insufficient privileges" error that occurs when users lack object permissions for report types.

## The Problem

When a user receives "insufficient privileges" when trying to view a report, the issue is often **NOT** folder permissions. Instead, it's usually missing object permissions required by the report type.

### Common Misconception

```
❌ "The user can't see the report because they don't have folder access"
✅ "The user can't see the report because the report type requires objects they can't read"
```

## Understanding Report Type Dependencies

Report types in Salesforce define which objects can be used in reports. Each report type has implicit object permission requirements.

### Standard Report Types

| Report Type | Required Object Permissions |
|-------------|---------------------------|
| `Account` | Account Read |
| `Opportunity` | Opportunity Read, Account Read |
| `CampaignWithCampaignMembers` | Campaign Read, **Lead Read**, Contact Read |
| `OpportunityWithProducts` | Opportunity Read, Product2 Read, PricebookEntry Read |
| `CaseWithSolutions` | Case Read, Solution Read |
| `LeadWithConvertedLead` | Lead Read |

### CPQ Report Types (SBQQ Package)

| Report Type | Required Object Permissions |
|-------------|---------------------------|
| `QuoteWithQuoteLines` | SBQQ__Quote__c Read, SBQQ__QuoteLine__c Read |
| `QuoteWithLineGroups` | SBQQ__Quote__c Read, SBQQ__QuoteLineGroup__c Read |
| `ProductWithOptions` | Product2 Read, SBQQ__ProductOption__c Read |
| `SubscriptionWithAmendments` | SBQQ__Subscription__c Read, SBQQ__QuoteLine__c Read |

## The CampaignWithCampaignMembers Gotcha

This is the most common permission issue we encounter:

```
User wants to: View a Campaign Member report
Report Type:   CampaignWithCampaignMembers
Actual Need:   Lead Read permission (even if report only shows Contacts!)

Why? The report type includes Lead as a possible member type, so Salesforce
requires Lead Read permission for the entire report type, regardless of
what's actually being displayed in the specific report.
```

## Diagnostic Process

### Step 1: Identify the Report Type

```bash
# Using SF CLI
sf data query --query "SELECT ReportType FROM Report WHERE DeveloperName = 'My_Report'" --target-org myorg
```

### Step 2: Analyze Report Type Dependencies

Use the `report-type-analyzer.js` script:

```bash
node scripts/lib/report-type-analyzer.js analyze CampaignWithCampaignMembers
```

Output:
```json
{
  "reportType": "CampaignWithCampaignMembers",
  "requiredObjects": ["Campaign", "Lead", "Contact", "CampaignMember"],
  "requiredPermissions": [
    {"object": "Campaign", "permission": "Read"},
    {"object": "Lead", "permission": "Read"},
    {"object": "Contact", "permission": "Read"},
    {"object": "CampaignMember", "permission": "Read"}
  ]
}
```

### Step 3: Validate User Permissions

```bash
node scripts/lib/report-type-analyzer.js validate CampaignWithCampaignMembers --user john.doe@company.com
```

Output:
```
Checking permissions for user: john.doe@company.com
Report Type: CampaignWithCampaignMembers

✓ Campaign - Read: Yes
✗ Lead - Read: NO (MISSING)
✓ Contact - Read: Yes
✓ CampaignMember - Read: Yes

RESULT: User is missing Lead Read permission
RECOMMENDATION: Add Lead Read to user's profile or permission set
```

### Step 4: Generate Permission Set XML

```bash
node scripts/lib/report-type-analyzer.js generate-permission-set CampaignWithCampaignMembers --name "Campaign_Report_Access"
```

## Using the /diagnose-report-access Command

The slash command provides an interactive diagnostic workflow:

```bash
/diagnose-report-access "Campaign Members by Status"
```

This will:
1. Query the report to get its report type
2. Analyze the report type's object dependencies
3. Check the current user's permissions
4. Generate recommendations for missing permissions

## Common Solutions

### Solution 1: Add Object Permissions to Profile

1. Go to Setup > Profiles > [Profile Name]
2. Find Object Settings
3. Add Read access to the missing object(s)

### Solution 2: Create a Permission Set

```xml
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>Campaign Report Access</label>
    <description>Grants object permissions required for Campaign Member reports</description>
    <objectPermissions>
        <allowRead>true</allowRead>
        <object>Lead</object>
    </objectPermissions>
</PermissionSet>
```

### Solution 3: Create a Custom Report Type

If users truly should not have Lead access, create a custom report type:

1. Setup > Report Types > New Custom Report Type
2. Primary Object: Campaign
3. Add Campaign Members (Contact Only)
4. Save and make available to profiles

## Best Practices

### Before Deploying Reports

1. Always check the report type's object dependencies
2. Verify target users have all required permissions
3. Document permission requirements in the report description

### When Creating Custom Report Types

1. Only include objects users actually need
2. Use object relationships sparingly
3. Consider creating multiple report types for different permission levels

### Permission Set Naming

Use descriptive names that indicate the report access:
- `Report_Access_Campaign_Members`
- `Report_Access_CPQ_Quotes`
- `Report_Access_Service_Cases`

## Troubleshooting Checklist

When a user reports "insufficient privileges" on a report:

1. [ ] Identify the report's report type
2. [ ] List all objects in the report type
3. [ ] Check user's Read permission for each object
4. [ ] Identify missing permissions
5. [ ] Determine if adding permission is appropriate
6. [ ] Either add permission or create alternative report type
7. [ ] Verify fix by having user test

## Related Scripts

| Script | Purpose |
|--------|---------|
| `report-type-analyzer.js` | Analyze report type dependencies |
| `org-context-detector.js` | Detect current org context |
| `sfdc-security-admin` agent | Comprehensive permission management |

## References

- [Salesforce Help: Report Type Permissions](https://help.salesforce.com/s/articleView?id=sf.reports_report_type_permissions.htm)
- [Salesforce Help: Object Permissions](https://help.salesforce.com/s/articleView?id=sf.perm_sets_object_perms.htm)
- Plugin: `salesforce-plugin/scripts/lib/report-type-analyzer.js`
