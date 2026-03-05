---
name: upsert
description: Unified interface for Lead/Contact/Account upsert operations with matching, enrichment, and conversion
argument-hint: "<action> [file|query] [--org <alias>] [--options...]"
---

# /upsert Command

Unified interface for Salesforce Lead/Contact/Account upsert operations with intelligent matching, optional enrichment, auto-conversion, and error handling.

## Usage

```bash
/upsert <action> [arguments] [--options]
```

## Actions

| Action | Description |
|--------|-------------|
| `import` | Import records from CSV/JSON file |
| `match` | Preview matching without creating/updating |
| `enrich` | Enrich existing records with external data |
| `convert` | Convert qualified Leads to Contacts/Accounts |
| `retry` | Process error queue and retry failed records |
| `status` | Show operation status and error queue |
| `config` | View or modify upsert configuration |
| `help` | Show detailed help |

---

## Action: import

Import records from a CSV or JSON file with automatic matching and deduplication.

### Syntax

```bash
/upsert import <file> --org <alias> [--object <Lead|Contact|Account>] [--options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--org` | Target Salesforce org alias | Required |
| `--object` | Target object type | Auto-detect |
| `--match-strategy` | Matching strategy: `strict`, `fuzzy`, `domain` | `fuzzy` |
| `--enrich` | Enable post-create enrichment | `false` |
| `--convert` | Auto-convert matching Leads | `false` |
| `--dry-run` | Preview without making changes | `false` |
| `--batch-size` | Records per batch | `200` |

### Examples

```bash
# Import leads with fuzzy matching
/upsert import ./leads.csv --org acme-prod --object Lead

# Import with enrichment enabled
/upsert import ./contacts.json --org acme-prod --object Contact --enrich

# Dry run to preview matching
/upsert import ./data.csv --org acme-sandbox --dry-run

# Import and auto-convert qualified leads
/upsert import ./mqls.csv --org acme-prod --convert
```

---

## Action: match

Preview how records would match against existing Salesforce data without making changes.

### Syntax

```bash
/upsert match <file|query> --org <alias> [--options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--org` | Target Salesforce org alias | Required |
| `--threshold` | Fuzzy match confidence threshold | `0.75` |
| `--cross-object` | Enable Lead/Contact cross-matching | `true` |
| `--domain-match` | Enable email domain → Account matching | `true` |
| `--output` | Output file for results | stdout |

### Examples

```bash
# Preview matching for CSV file
/upsert match ./leads.csv --org acme-prod

# Match with higher confidence threshold
/upsert match ./data.csv --org acme-prod --threshold 0.85

# Output match results to file
/upsert match ./leads.csv --org acme-prod --output ./match-results.json
```

---

## Action: enrich

Enrich existing Salesforce records with external data sources.

### Syntax

```bash
/upsert enrich --org <alias> [--object <type>] [--options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--org` | Target Salesforce org alias | Required |
| `--object` | Object type to enrich | `Lead` |
| `--ids` | Specific record IDs (comma-separated) | All matching |
| `--stale-days` | Only enrich records older than N days | `180` |
| `--fields` | Specific fields to enrich | All configured |
| `--providers` | Provider priority list | Config default |
| `--batch-size` | Records per batch | `50` |

### Examples

```bash
# Enrich stale leads
/upsert enrich --org acme-prod --object Lead --stale-days 180

# Enrich specific accounts
/upsert enrich --org acme-prod --object Account --ids 001ABC,001DEF

# Enrich with specific fields
/upsert enrich --org acme-prod --fields "AnnualRevenue,NumberOfEmployees"
```

---

## Action: convert

Convert qualified Leads to Contacts and Accounts.

### Syntax

```bash
/upsert convert --org <alias> [--criteria <SOQL>] [--options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--org` | Target Salesforce org alias | Required |
| `--criteria` | SOQL WHERE clause for Lead selection | Config default |
| `--ids` | Specific Lead IDs to convert | All matching |
| `--create-opportunity` | Create Opportunity on conversion | `false` |
| `--prevent-duplicates` | Skip if Contact already exists | `true` |
| `--dry-run` | Preview without converting | `false` |

### Examples

```bash
# Convert all qualified leads
/upsert convert --org acme-prod --criteria "Status = 'Qualified'"

# Convert specific leads
/upsert convert --org acme-prod --ids 00QABC,00QDEF

# Preview conversion
/upsert convert --org acme-sandbox --criteria "Status = 'MQL'" --dry-run

# Convert with opportunity creation
/upsert convert --org acme-prod --create-opportunity
```

---

## Action: retry

Process the error queue and retry failed upsert operations.

### Syntax

```bash
/upsert retry --org <alias> [--options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--org` | Target Salesforce org alias | Required |
| `--max-retries` | Maximum retry attempts | `3` |
| `--error-types` | Filter by error types | All |
| `--escalate` | Escalate max-retry records | `true` |

### Examples

```bash
# Process all pending retries
/upsert retry --org acme-prod

# Retry only specific error types
/upsert retry --org acme-prod --error-types "REQUIRED_FIELD_MISSING,API_LIMIT_EXCEEDED"

# Retry with escalation disabled
/upsert retry --org acme-prod --escalate false
```

---

## Action: status

Show upsert operation status and error queue summary.

### Syntax

```bash
/upsert status --org <alias> [--options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--org` | Target Salesforce org alias | Required |
| `--operation-id` | Specific operation ID | All recent |
| `--errors-only` | Show only error queue | `false` |
| `--days` | History days to show | `7` |

### Examples

```bash
# Show recent status
/upsert status --org acme-prod

# Show error queue only
/upsert status --org acme-prod --errors-only

# Show specific operation
/upsert status --org acme-prod --operation-id uuid-123
```

---

## Action: config

View or modify upsert configuration for an org.

### Syntax

```bash
/upsert config --org <alias> [--set <key=value>] [--show]
```

### Examples

```bash
# Show current configuration
/upsert config --org acme-prod --show

# Set fuzzy match threshold
/upsert config --org acme-prod --set matching.fuzzyThreshold=0.80

# Enable domain matching
/upsert config --org acme-prod --set matching.domainMatchEnabled=true

# Set default conversion criteria
/upsert config --org acme-prod --set conversion.criteria="Status = 'Qualified'"
```

---

## Output Examples

### Import Summary

```
Upsert Import Results (acme-prod)
═══════════════════════════════════════════════════════

Input:      ./leads.csv (100 records)
Duration:   12.5 seconds

Summary:
  ✓ Matched:     85 records (UPDATE)
  ✓ Created:     12 records (CREATE)
  ⚠ Review:       2 records (MANUAL_REVIEW)
  ✗ Failed:       1 record  (ERROR_QUEUE)

Match Breakdown:
  • Email exact:     65 (76%)
  • Domain match:    12 (14%)
  • Fuzzy match:      8 (10%)

Actions Taken:
  • Records updated:   85
  • Records created:   12
  • Contacts created:   8 (under existing Accounts)

Next Steps:
  • Review 2 ambiguous matches: /upsert status --org acme-prod --errors-only
  • Retry failed record: /upsert retry --org acme-prod
```

### Match Preview

```
Match Preview Results (acme-prod)
═══════════════════════════════════════════════════════

Record 1: john@acme.com → MATCH (Lead: 00QABC123)
  Confidence: 100% (EMAIL_EXACT)
  Action: UPDATE

Record 2: jane@enterprise.io → MATCH (Account: 001XYZ789)
  Confidence: 85% (DOMAIN_MATCH)
  Action: CREATE_CONTACT_UNDER_ACCOUNT

Record 3: bob@unknown.xyz → NO MATCH
  Action: CREATE_NEW

Record 4: sam@bigco.com → MULTIPLE MATCHES
  • Account: Big Company Inc (78%)
  • Account: BigCo Corporation (72%)
  Action: MANUAL_REVIEW
```

---

## Configuration File

Located at `instances/{org}/upsert-config.json`:

```json
{
  "matching": {
    "fuzzyThreshold": 0.75,
    "domainMatchEnabled": true,
    "crossObjectDedup": true
  },
  "enrichment": {
    "enabled": false,
    "providers": ["internal", "zoominfo"]
  },
  "conversion": {
    "autoConvertEnabled": false,
    "criteria": "Status = 'Qualified'",
    "createOpportunity": false
  },
  "errorHandling": {
    "maxRetries": 3,
    "escalateOnMaxRetries": true
  }
}
```

---

## Related Commands

- `/lead-convert` - Dedicated Lead conversion command
- `/upsert-config` - Configuration management
- `/sfdc-discovery` - Org analysis before upsert

## Related Agents

- `sfdc-upsert-orchestrator` - Master orchestrator
- `sfdc-upsert-matcher` - Matching engine
- `sfdc-lead-auto-converter` - Lead conversion
- `sfdc-enrichment-manager` - Data enrichment
- `sfdc-upsert-error-handler` - Error queue management
