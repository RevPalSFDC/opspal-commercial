---
name: query-field-dictionary
description: Query field dictionary by name, tag, audience, or free-text search
argument-hint: "acme-corp Amount"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
thinking-mode: enabled
arguments:
  - name: org
    description: Organization slug for the dictionary (e.g., acme-corp, eta-corp)
    required: true
  - name: query
    description: Search query (field name, tag, or free text)
    required: false
  - name: tags
    description: Filter by tags (e.g., Revenue,Pipeline)
    required: false
  - name: audience
    description: Filter by audience relevance (Executive, Manager, Analyst, Operations)
    required: false
  - name: format
    description: Output format (table, json, context)
    required: false
    default: table
---

# Query Field Dictionary

## Purpose

**What this command does**: Searches and queries the field dictionary to find fields by name, tag, audience, or description. Returns field definitions with business context for reporting and analysis.

**When to use it**:
- ✅ Finding the right fields for a report
- ✅ Understanding what a field means before using it
- ✅ Discovering fields by business category (Revenue, Pipeline, etc.)
- ✅ Testing dictionary enrichments

**When NOT to use it**:
- ❌ No dictionary exists (run `/generate-field-dictionary` first)
- ❌ Need to modify fields (use `/enrich-field-dictionary`)

## Usage

```bash
# Search by field name
/query-field-dictionary acme-corp Amount

# Search by free text
/query-field-dictionary acme-corp "annual revenue"

# Filter by tag
/query-field-dictionary acme-corp --tags Revenue

# Filter by audience
/query-field-dictionary acme-corp --audience Executive

# Multiple filters
/query-field-dictionary acme-corp --tags Revenue,Pipeline --audience Executive

# Output as JSON
/query-field-dictionary acme-corp Amount --format json

# Generate LLM context
/query-field-dictionary acme-corp --tags Revenue --format context
```

## PROCESS

### 1) Load Dictionary

**Verify dictionary exists:**
```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/revpal-internal-plugins/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

FD_LOADER=$(find_script "field-dictionary-loader.js")
if [ -z "$FD_LOADER" ]; then echo "ERROR: field-dictionary-loader.js not found"; exit 1; fi

node "$FD_LOADER" stats "${ORG_SLUG}"
```

### 2) Execute Query

**Search fields:**
```bash
# By name/text
node "$FD_LOADER" search "${ORG_SLUG}" "${QUERY}"

# By tag
node "$FD_LOADER" tags "${ORG_SLUG}" "${TAG}"

# Generate context
node "$FD_LOADER" context "${ORG_SLUG}" \
  ${AUDIENCE:+--audience "$AUDIENCE"} \
  ${TAGS:+--tags "$TAGS"}
```

### 3) Format and Display Results

**Table format (default):**
```
🔍 Search Results for "amount" in acme-corp

Found 8 matching fields:

| Platform   | Object              | Field                    | Type     | Description                                    |
|------------|---------------------|--------------------------|----------|------------------------------------------------|
| salesforce | Opportunity         | Amount                   | Currency | Total expected revenue for this opportunity    |
| salesforce | OpportunityLineItem | TotalPrice               | Currency | Line item total price                          |
| salesforce | SBQQ__Quote__c      | SBQQ__NetAmount__c       | Currency | Net quote amount after discounts               |
| salesforce | SBQQ__Quote__c      | SBQQ__ListAmount__c      | Currency | List price total before discounts              |
| salesforce | Account             | AnnualRevenue            | Currency | Company's annual revenue                       |
| hubspot    | deals               | amount                   | Number   | Deal value in pipeline                         |
| hubspot    | deals               | hs_closed_amount         | Number   | Final closed deal amount                       |
| hubspot    | deals               | hs_projected_amount      | Number   | Projected deal value                           |

💡 Use --format json for full field details
```

**JSON format:**
```json
{
  "query": "amount",
  "org": "acme-corp",
  "results": [
    {
      "platform": "salesforce",
      "object": "Opportunity",
      "field": "Amount",
      "definition": {
        "api_name": "Amount",
        "field_name": "Amount",
        "field_type": "Currency",
        "description": "Total expected revenue for this opportunity",
        "example_values": ["$25,000", "$150,000"],
        "use_cases": ["Pipeline forecasting", "Revenue reporting"],
        "reporting_guidance": {
          "recommended_aggregations": ["SUM", "AVG"],
          "caveats": "Verify currency conversion for multi-currency orgs"
        },
        "audience_relevance": "Executive",
        "tags": ["Revenue", "Pipeline"]
      }
    }
  ]
}
```

**Context format (for LLM consumption):**
```markdown
# Field Reference for Report Building

Use these field definitions to understand what data is available and how to use it correctly.

## Salesforce

### Opportunity
> Sales opportunities in the pipeline

| Field | Type | Description | Aggregations | Caveats |
|-------|------|-------------|--------------|---------|
| Amount | Currency | Total expected revenue for this opportunity | SUM, AVG | Verify currency conversion... |
| StageName | Picklist | Current pipeline stage | COUNT, GROUP | - |
| CloseDate | Date | Expected close date | MIN, MAX | - |

### Account
> Companies and organizations

| Field | Type | Description | Aggregations | Caveats |
|-------|------|-------------|--------------|---------|
| AnnualRevenue | Currency | Company's annual revenue | SUM, AVG | Self-reported, verify |
```

## Examples

### Example 1: Find Revenue Fields

```
User: /query-field-dictionary eta-corp --tags Revenue

Agent:
🔍 Fields tagged 'Revenue' in eta-corp

Found 23 fields:

Salesforce:
  Opportunity.Amount - Total expected revenue
  Opportunity.ExpectedRevenue - Amount * Probability
  Account.AnnualRevenue - Company's annual revenue
  SBQQ__Quote__c.SBQQ__NetAmount__c - Net quote amount
  SBQQ__Subscription__c.SBQQ__NetPrice__c - Subscription net price
  ...

HubSpot:
  deals.amount - Deal value
  deals.hs_closed_amount - Final closed amount
  ...
```

### Example 2: Executive Dashboard Fields

```
User: /query-field-dictionary acme-corp --audience Executive --format context

Agent:
# Executive Dashboard Field Reference

## Key Metrics

### Revenue Fields
- **Opportunity.Amount** (Currency) - Total expected revenue
  - Aggregate: SUM for pipeline, AVG for deal size
  - Caveat: Verify currency conversion

### Pipeline Fields
- **Opportunity.StageName** (Picklist) - Current stage
  - Aggregate: COUNT by stage
  - Related: CloseDate, Probability

### Health Indicators
- **Account.Health_Score__c** (Number) - Customer health 0-100
  - Aggregate: AVG by segment
  - Drill-down: Last Activity, Open Cases
```

### Example 3: Specific Field Lookup

```
User: /query-field-dictionary eta-corp salesforce Opportunity Amount --format json

Agent:
{
  "platform": "salesforce",
  "object": "Opportunity",
  "field": "Amount",
  "definition": {
    "api_name": "Amount",
    "field_name": "Amount",
    "field_type": "Currency",
    "description": "Total expected revenue for this opportunity in the customer's currency",
    "example_values": ["$25,000", "$150,000", "$1,200,000"],
    "is_required": true,
    "is_calculated": false,
    "use_cases": [
      "Pipeline forecasting",
      "Revenue reporting",
      "Sales rep performance tracking"
    ],
    "reporting_guidance": {
      "recommended_aggregations": ["SUM", "AVG", "MIN", "MAX"],
      "caveats": "Verify currency conversion for multi-currency orgs. Does NOT include recurring revenue components.",
      "related_fields": ["ExpectedRevenue", "Probability", "StageName"],
      "drill_down_fields": ["Product", "Region", "Owner"]
    },
    "audience_relevance": "Executive",
    "tags": ["Revenue", "Pipeline"]
  }
}
```

### Example 4: Cross-Platform Search

```
User: /query-field-dictionary acme-corp "close date"

Agent:
🔍 Search Results for "close date" in acme-corp

Found 4 matching fields:

| Platform   | Object      | Field           | Type | Tags     |
|------------|-------------|-----------------|------|----------|
| salesforce | Opportunity | CloseDate       | Date | Pipeline |
| salesforce | SBQQ__Quote__c | SBQQ__ExpirationDate__c | Date | CPQ |
| hubspot    | deals       | closedate       | Date | Pipeline |
| hubspot    | deals       | hs_closed_won_date | Date | Pipeline |

💡 Use "closedate" (no space) for HubSpot property
```

## Output Formats

| Format | Use Case |
|--------|----------|
| `table` | Quick visual scan of results |
| `json` | Programmatic access, full details |
| `context` | LLM-ready markdown for agents |

## Error Handling

| Error | Resolution |
|-------|------------|
| Dictionary not found | Run `/generate-field-dictionary` first |
| No results | Try broader search terms or check spelling |
| Invalid tag | Use one of: Revenue, Pipeline, Marketing, Sales, Service, etc. |

## Available Tags

Standard tags for filtering:
- **Revenue** - Revenue-related fields
- **Pipeline** - Pipeline and forecast fields
- **Marketing** - Marketing campaign fields
- **Sales** - Sales activity fields
- **Service** - Customer service fields
- **Firmographic** - Company/account info
- **Contact** - Person/contact info
- **Activity** - Activity tracking fields
- **Product** - Product catalog fields
- **Financial** - Financial/billing fields
- **CPQ** - CPQ/Quote fields
- **Renewal** - Renewal tracking fields
- **Forecast** - Forecast category fields
- **Integration** - Integration/sync fields
- **System** - System-managed fields
- **Custom** - Custom fields

## Related Commands

- `/generate-field-dictionary` - Create dictionary
- `/enrich-field-dictionary` - Add business context
