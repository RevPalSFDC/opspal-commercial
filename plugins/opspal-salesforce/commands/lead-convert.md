---
name: lead-convert
description: Convert Leads to Contacts/Accounts with duplicate prevention and optional Opportunity creation
argument-hint: "<action> [--org <alias>] [--options...]"
---

# /lead-convert Command

Convert Salesforce Leads to Contacts and Accounts with intelligent matching, duplicate prevention, and Campaign history preservation.

## Usage

```bash
/lead-convert <action> [arguments] [--options]
```

## Actions

| Action | Description |
|--------|-------------|
| `diagnose` | Analyze Lead for conversion blockers |
| `preview` | Preview conversion without executing |
| `convert` | Convert a single Lead |
| `batch` | Convert multiple Leads from criteria or file |
| `status` | Show conversion history and results |
| `help` | Show detailed help |

---

## Action: diagnose

Analyze a Lead to identify conversion blockers and provide recommendations.

### Syntax

```bash
/lead-convert diagnose <leadId> --org <alias>
```

### Examples

```bash
# Diagnose single lead
/lead-convert diagnose 00QABC123 --org acme-prod

# Diagnose with detailed field analysis
/lead-convert diagnose 00QABC123 --org acme-prod --verbose
```

### Output

```
Lead Conversion Diagnosis (00QABC123)
═══════════════════════════════════════════════════════

Lead: John Doe (john@acme.com)
Company: Acme Corporation
Status: Marketing Qualified

Conversion Readiness: ⚠ WARNINGS

Blockers (0):
  None detected

Warnings (2):
  ⚠ Account Match: Multiple potential matches found
    • Acme Corp (001ABC) - 85% confidence
    • ACME Inc (001DEF) - 72% confidence
    Recommendation: Review and select correct Account

  ⚠ Existing Contact: Contact with same email exists
    • Jane Doe (003XYZ) on Account 001ABC
    Recommendation: Update existing Contact instead

Required Fields Check:
  ✓ LastName: Doe
  ✓ Company: Acme Corporation
  ✓ Status: Marketing Qualified

Field Mapping Preview:
  Lead.Company → Account.Name (if creating Account)
  Lead.Website → Account.Website
  Lead.FirstName → Contact.FirstName
  Lead.LastName → Contact.LastName
  Lead.Email → Contact.Email
  Lead.Phone → Contact.Phone
  Lead.Title → Contact.Title

Campaign Memberships (3):
  • Spring 2026 Campaign (Responded)
  • Product Webinar (Attended)
  • Newsletter (Subscribed)
  → All campaigns will transfer to Contact
```

---

## Action: preview

Preview conversion results without making changes.

### Syntax

```bash
/lead-convert preview --org <alias> [--criteria <SOQL>] [--ids <list>]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--org` | Target Salesforce org alias | Required |
| `--criteria` | SOQL WHERE clause for Lead selection | None |
| `--ids` | Comma-separated Lead IDs | None |
| `--limit` | Maximum records to preview | `50` |

### Examples

```bash
# Preview qualified leads
/lead-convert preview --org acme-prod --criteria "Status = 'Qualified'"

# Preview specific leads
/lead-convert preview --org acme-prod --ids 00QABC,00QDEF,00QGHI

# Preview with limit
/lead-convert preview --org acme-prod --criteria "Rating = 'Hot'" --limit 10
```

### Output

```
Lead Conversion Preview (acme-prod)
═══════════════════════════════════════════════════════

Query: Status = 'Qualified'
Leads Found: 25

Conversion Summary:
  ✓ Ready to Convert:     20
  ⚠ Needs Review:          3
  ✗ Cannot Convert:        2

Ready to Convert (20):
┌─────────────────┬────────────────────┬─────────────────────┬──────────────┐
│ Lead            │ Account Match      │ Action              │ Opportunity  │
├─────────────────┼────────────────────┼─────────────────────┼──────────────┤
│ John Doe        │ Acme Corp (exists) │ Create Contact      │ Yes          │
│ Jane Smith      │ None               │ Create Both         │ Yes          │
│ Bob Johnson     │ BigCo (exists)     │ Create Contact      │ No           │
└─────────────────┴────────────────────┴─────────────────────┴──────────────┘

Needs Review (3):
  • Sam Wilson: Multiple Account matches (review required)
  • Lisa Chen: Existing Contact with same email
  • Mike Brown: Account exists but owned by different team

Cannot Convert (2):
  • Alice Garcia: Required field missing (LastName)
  • Tom Davis: Lead already converted
```

---

## Action: convert

Convert a single Lead to Contact and Account.

### Syntax

```bash
/lead-convert convert <leadId> --org <alias> [--options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--org` | Target Salesforce org alias | Required |
| `--account-id` | Specify Account to use | Auto-match |
| `--create-account` | Create new Account if no match | `true` |
| `--create-opportunity` | Create Opportunity | `false` |
| `--opportunity-name` | Custom Opportunity name | `{Company} - New Business` |
| `--contact-role` | Contact role on Opportunity | `Decision Maker` |
| `--owner-id` | Override owner assignment | Account owner |
| `--notify` | Send notification to new owner | `true` |

### Examples

```bash
# Basic conversion
/lead-convert convert 00QABC123 --org acme-prod

# Convert to specific account
/lead-convert convert 00QABC123 --org acme-prod --account-id 001XYZ789

# Convert with opportunity
/lead-convert convert 00QABC123 --org acme-prod --create-opportunity --opportunity-name "Acme - Enterprise Deal"

# Convert with custom owner
/lead-convert convert 00QABC123 --org acme-prod --owner-id 005USER123
```

### Output

```
Lead Conversion Result
═══════════════════════════════════════════════════════

Lead: John Doe (00QABC123) ✓ CONVERTED

Results:
  • Contact Created: 003NEW456 (John Doe)
  • Account Used: 001EXIST789 (Acme Corporation)
  • Opportunity Created: 006OPP123 (Acme - New Business)
  • Contact Role: Decision Maker (Primary)

Ownership:
  • Previous Lead Owner: Sarah Sales (005AAA)
  • New Contact Owner: Mike Manager (005BBB) [Account Owner]
  • Notification: Sent ✓

Campaign History:
  • 3 campaigns transferred to Contact

Post-Conversion:
  • Lead Status: Converted
  • Lead ConvertedAccountId: 001EXIST789
  • Lead ConvertedContactId: 003NEW456
  • Lead ConvertedOpportunityId: 006OPP123
```

---

## Action: batch

Convert multiple Leads based on criteria or from a file.

### Syntax

```bash
/lead-convert batch --org <alias> [--criteria <SOQL>] [--file <path>] [--options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--org` | Target Salesforce org alias | Required |
| `--criteria` | SOQL WHERE clause | None |
| `--file` | CSV/JSON file with Lead IDs | None |
| `--create-opportunity` | Create Opportunities | `false` |
| `--prevent-duplicates` | Skip if Contact exists | `true` |
| `--batch-size` | Leads per batch | `50` |
| `--continue-on-error` | Don't stop on individual errors | `true` |
| `--dry-run` | Preview without converting | `false` |

### Examples

```bash
# Convert all qualified leads
/lead-convert batch --org acme-prod --criteria "Status = 'Qualified'"

# Convert from file
/lead-convert batch --org acme-prod --file ./leads-to-convert.csv

# Batch with opportunities
/lead-convert batch --org acme-prod --criteria "Rating = 'Hot'" --create-opportunity

# Dry run
/lead-convert batch --org acme-sandbox --criteria "Status = 'MQL'" --dry-run
```

### Output

```
Batch Lead Conversion Results (acme-prod)
═══════════════════════════════════════════════════════

Query: Status = 'Qualified'
Total Leads: 50
Duration: 45 seconds

Results:
  ✓ Converted:        42 (84%)
  ⚠ Skipped:           5 (10%)
  ✗ Failed:            3 (6%)

Converted (42):
  • New Contacts created: 42
  • Existing Accounts used: 28
  • New Accounts created: 14
  • Opportunities created: 0

Skipped (5):
  • Duplicate Contact exists: 3
  • Multiple Account matches: 2

Failed (3):
  • Required field missing: 2
  • Validation rule error: 1
  → Added to error queue for review

Next Steps:
  • Review skipped: /lead-convert status --org acme-prod --show-skipped
  • Retry failed: /upsert retry --org acme-prod
```

---

## Action: status

Show conversion history and results.

### Syntax

```bash
/lead-convert status --org <alias> [--options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--org` | Target Salesforce org alias | Required |
| `--days` | History days to show | `7` |
| `--show-skipped` | Include skipped records | `false` |
| `--show-failed` | Include failed records | `true` |
| `--operation-id` | Specific batch operation | All |

### Examples

```bash
# Show recent conversions
/lead-convert status --org acme-prod

# Show with skipped records
/lead-convert status --org acme-prod --show-skipped

# Show specific operation
/lead-convert status --org acme-prod --operation-id uuid-123
```

---

## Configuration

Conversion rules are configured in `instances/{org}/lead-conversion-rules.json`:

```json
{
  "conversionCriteria": [
    {
      "name": "Qualified Lead",
      "conditions": [
        { "field": "Status", "operator": "equals", "value": "Qualified" }
      ],
      "createOpportunity": true,
      "opportunityName": "{Company} - New Business"
    }
  ],
  "accountMatching": {
    "strategy": "domain-first",
    "createIfNoMatch": true
  },
  "contactMatching": {
    "preventDuplicates": true
  },
  "ownershipRules": {
    "useAccountOwner": true
  }
}
```

---

## Best Practices

### Before Batch Conversion

1. **Run preview first**: `/lead-convert preview --org <alias> --criteria "..."`
2. **Check for duplicates**: Review "Needs Review" items
3. **Verify field mappings**: Use `/lead-convert diagnose` on sample Lead
4. **Test in sandbox**: Always test batch operations in sandbox first

### During Conversion

1. **Use appropriate batch size**: 50 records is optimal
2. **Enable continue-on-error**: Don't let one failure stop the batch
3. **Monitor progress**: Check status periodically

### After Conversion

1. **Verify results**: Query converted records
2. **Check Campaign history**: Ensure campaigns transferred
3. **Review error queue**: Address any failures
4. **Notify stakeholders**: Inform sales team of new Contacts

---

## Related Commands

- `/upsert` - Full upsert operations including conversion
- `/upsert retry` - Retry failed conversions

## Related Agents

- `sfdc-lead-auto-converter` - Lead conversion specialist
- `sfdc-upsert-orchestrator` - Master orchestrator
- `sfdc-upsert-matcher` - Matching engine
