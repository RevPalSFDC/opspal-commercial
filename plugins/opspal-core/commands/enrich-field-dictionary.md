---
name: enrich-field-dictionary
description: Interactive workflow to add business context to field dictionary entries
argument-hint: "acme-corp"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
thinking-mode: enabled
arguments:
  - name: org
    description: Organization slug for the dictionary (e.g., acme-corp, eta-corp)
    required: true
  - name: object
    description: Specific object to enrich (optional, for focused enrichment)
    required: false
  - name: tags
    description: Focus on fields with specific tags (e.g., Revenue,Pipeline)
    required: false
  - name: audience
    description: Target audience for enrichment (Executive, Manager, Analyst, Operations)
    required: false
---

# Enrich Field Dictionary

## Purpose

**What this command does**: Interactively enriches field dictionary entries with business context including descriptions, use cases, reporting guidance, and caveats. Transforms technical metadata into LLM-consumable knowledge.

**When to use it**:
- ✅ After generating a new field dictionary
- ✅ Before building executive-level reports
- ✅ When preparing for client assessments
- ✅ To improve reporting agent accuracy

**When NOT to use it**:
- ❌ No dictionary exists (run `/generate-field-dictionary` first)
- ❌ Bulk automated enrichment needed (use agent instead)

## Usage

```bash
# Interactive enrichment of entire dictionary
/enrich-field-dictionary acme-corp

# Enrich specific object
/enrich-field-dictionary acme-corp --object Opportunity

# Focus on revenue-related fields
/enrich-field-dictionary acme-corp --tags Revenue,Pipeline

# Enrich for executive audience
/enrich-field-dictionary acme-corp --audience Executive
```

## PROCESS

### 1) Load Dictionary

**Verify dictionary exists:**
```bash
DICT_PATH="orgs/${ORG_SLUG}/configs/field-dictionary.yaml"

if [ ! -f "$DICT_PATH" ]; then
  echo "❌ Dictionary not found at: ${DICT_PATH}"
  echo "   Run: /generate-field-dictionary ${ORG_SLUG}"
  exit 1
fi
```

**Load and analyze:**
```bash
node plugins/opspal-core/scripts/lib/field-dictionary-loader.js stats "${ORG_SLUG}"
```

### 2) Identify Fields Needing Enrichment

**Get unenriched fields:**
```bash
node plugins/opspal-core/scripts/lib/field-dictionary-loader.js unenriched "${ORG_SLUG}"
```

**Prioritize by importance:**
1. Revenue fields (Amount, ARR, MRR, TCV, ACV)
2. Pipeline fields (Stage, Close Date, Probability)
3. CPQ fields (Quote, Subscription, Net Price)
4. Fields tagged as Executive audience
5. Custom fields with no description

**Show enrichment summary:**
```
📊 Enrichment Status: 12% complete

Unenriched Fields: 567 of 643
  - Missing description: 498
  - Missing use_cases: 612
  - Missing reporting_guidance: 589

High-Priority Fields (recommend enriching first):
  1. Opportunity.Amount (Revenue, Pipeline)
  2. Opportunity.StageName (Pipeline)
  3. Opportunity.CloseDate (Pipeline)
  4. SBQQ__Quote__c.SBQQ__NetAmount__c (Revenue, CPQ)
  5. Account.AnnualRevenue (Revenue, Firmographic)
```

### 3) Interactive Enrichment Session

**For each priority field, gather context:**

**Field: Opportunity.Amount**
```
📝 Enriching: Opportunity.Amount

Technical Info:
  - Type: Currency
  - Label: Amount
  - Required: Yes
  - Tags: Revenue, Pipeline (auto-inferred)

Current enrichment: (none)

Please provide:

1. Description (what does this field represent?):
   > Total expected revenue for this opportunity in the customer's currency

2. Example values (2-3 representative values):
   > $25,000, $150,000, $1,200,000

3. Use cases (how is this field typically used?):
   > - Pipeline forecasting
   > - Revenue reporting
   > - Sales rep performance tracking
   > - Quota attainment calculations

4. Reporting caveats (important considerations):
   > - Verify currency conversion for multi-currency orgs
   > - Does NOT include recurring revenue components
   > - May differ from final contract value

5. Recommended aggregations: [SUM, AVG, MIN, MAX] (auto-suggested)
   > Confirmed

6. Audience relevance: [Executive, Manager, Analyst, Operations, All]
   > Executive
```

### 4) Update Dictionary

**Apply enrichment:**
```yaml
# Before
Opportunity:
  fields:
    Amount:
      api_name: Amount
      field_name: Amount
      field_type: Currency
      description: ""
      example_values: []
      use_cases: []
      tags: [Revenue, Pipeline]

# After
Opportunity:
  fields:
    Amount:
      api_name: Amount
      field_name: Amount
      field_type: Currency
      description: "Total expected revenue for this opportunity in the customer's currency"
      example_values: ["$25,000", "$150,000", "$1,200,000"]
      use_cases:
        - Pipeline forecasting
        - Revenue reporting
        - Sales rep performance tracking
        - Quota attainment calculations
      reporting_guidance:
        recommended_aggregations: [SUM, AVG, MIN, MAX]
        caveats: "Verify currency conversion for multi-currency orgs. Does NOT include recurring revenue components. May differ from final contract value."
        related_fields: [ExpectedRevenue, Probability, StageName]
        drill_down_fields: [Product, Region, Owner]
      audience_relevance: Executive
      tags: [Revenue, Pipeline]
```

### 5) Save and Report Progress

**Save dictionary:**
```bash
# Auto-backup before save
cp "${DICT_PATH}" "${DICT_PATH}.bak.$(date +%Y%m%d%H%M%S)"

# Write updated dictionary
```

**Show progress:**
```
✅ Field enriched: Opportunity.Amount

📊 Session Progress:
   Fields enriched this session: 5
   Total enriched: 81 of 643 (13%)

📋 Continue with next priority field?
   1. Yes, continue
   2. Save and exit
   3. Skip to different object
```

### 6) Completion Summary

**Final report:**
```
✅ Enrichment Session Complete!

📊 Session Summary:
   Fields enriched: 12
   Time spent: 15 minutes
   Enrichment rate: 12% → 24%

📁 Dictionary saved to: orgs/acme-corp/configs/field-dictionary.yaml
📁 Backup created: orgs/acme-corp/configs/field-dictionary.yaml.bak.20260128143022

📋 Remaining Work:
   - 489 fields still need enrichment
   - Highest priority: CPQ fields (67 unenriched)

💡 Tips:
   - Run /query-field-dictionary to test your enrichments
   - Reporting agents will now use this context automatically
```

## Examples

### Example 1: Full Interactive Session

```
User: /enrich-field-dictionary eta-corp

Agent:
📊 Loading dictionary for eta-corp...
   Total fields: 612
   Enriched: 0 (0%)

Starting interactive enrichment...

📝 Field 1 of 612: Opportunity.Amount

[Interactive prompts for description, use cases, etc.]

✅ Enriched! Continue? (Y/n)
```

### Example 2: Focus on Object

```
User: /enrich-field-dictionary eta-corp --object SBQQ__Quote__c

Agent:
📊 Focusing on SBQQ__Quote__c...
   Fields in object: 89
   Enriched: 0 (0%)

📝 Field 1 of 89: SBQQ__Quote__c.SBQQ__NetAmount__c

[Targeted enrichment for CPQ fields]
```

### Example 3: Executive Audience Focus

```
User: /enrich-field-dictionary acme-corp --audience Executive

Agent:
📊 Filtering for Executive-relevant fields...
   Identified 45 high-priority fields

Priority ranking:
  1. Total Revenue metrics
  2. Pipeline stage summaries
  3. Key conversion rates
  4. Customer health indicators

📝 Field 1 of 45: Opportunity.Amount
```

## Enrichment Template

For each field, collect:

| Attribute | Purpose | Example |
|-----------|---------|---------|
| description | What the field represents | "Total expected revenue..." |
| example_values | Representative values | ["$25,000", "$150,000"] |
| use_cases | Business applications | ["Pipeline forecasting", "Revenue reporting"] |
| reporting_guidance.caveats | Important considerations | "Verify currency conversion..." |
| reporting_guidance.related_fields | Often used together | ["ExpectedRevenue", "Probability"] |
| reporting_guidance.drill_down_fields | For deeper analysis | ["Product", "Region"] |
| audience_relevance | Primary users | "Executive" |

## Error Handling

| Error | Resolution |
|-------|------------|
| Dictionary not found | Run `/generate-field-dictionary` first |
| Object not found | Check object name spelling |
| Save failed | Check write permissions, restore from backup |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| ENRICH_BATCH_SIZE | 10 | Fields to process before auto-save |
| ENRICH_AUTO_BACKUP | true | Create backup before each save |

## Related Commands

- `/generate-field-dictionary` - Create initial dictionary skeleton
- `/query-field-dictionary` - Test field lookups
