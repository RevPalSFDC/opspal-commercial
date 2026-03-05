---
name: enrich-data
description: Trigger multi-source enrichment pipeline to fill data gaps
argument-hint: "[--object Account|Contact] [--fields email,title,industry] [--source auto|website|linkedin|search]"
visibility: user-invocable
aliases:
  - enrich
  - fill-gaps
tags:
  - data-quality
  - enrichment
  - revops
---

# /enrich-data Command

Run the Mira-inspired multi-source enrichment pipeline to fill missing data in CRM records. Uses confidence scoring and early termination to optimize for quality and cost.

## Usage

```bash
# Auto-enrich accounts with missing industry/employee count
/enrich-data --object Account --fields industry,employee_count

# Enrich contacts with title and seniority
/enrich-data --object Contact --fields title,seniority,department

# Enrich from specific sources only
/enrich-data --object Account --source website,linkedin

# Full enrichment with all sources
/enrich-data --object Contact --source auto
```

## Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--object` | Account, Contact, Lead | Account | Target object type |
| `--fields` | [comma-separated] | (object defaults) | Fields to enrich |
| `--source` | auto, website, linkedin, search | auto | Enrichment sources |
| `--confidence` | 1-5 | 4 | Minimum confidence to apply |
| `--limit` | [number] | 100 | Max records to process |
| `--org` | [org-alias] | default | Salesforce org alias |
| `--dry-run` | true/false | false | Preview without updating |
| `--input` | [path] | - | JSON input data file (required for CLI) |

## Enrichment Sources

### 1. Website Discovery (Confidence: 4-5)
- Crawls company website for firmographic data
- Extracts: industry, employee count, description, social links
- Best for: Company overview, contact information

### 2. LinkedIn Enrichment (Confidence: 4-5)
- Professional network company/person data
- Extracts: titles, departments, headquarters, founded year
- Best for: Contact details, company firmographics

### 3. Web Search (Confidence: 2-3)
- General web search for missing data
- Sources: news, directories, public databases
- Best for: Filling gaps when authoritative sources fail

## Confidence Scoring

| Level | Score | Meaning | Action |
|-------|-------|---------|--------|
| VERIFIED | 5 | Multi-source corroboration | Auto-apply |
| HIGH | 4 | Authoritative source | Auto-apply |
| MEDIUM | 3 | Secondary source | Apply with flag |
| LOW | 2 | Search results | Review required |
| INFERRED | 1 | AI-inferred | Manual only |

## Field Defaults by Object

### Account (Firmographic)
- `industry` - Company industry classification
- `employee_count` - Company size
- `annual_revenue` - Estimated revenue
- `website` - Company website
- `description` - Company description
- `headquarters` - HQ location

### Contact (Biographic)
- `title` - Job title
- `seniority` - Seniority level
- `department` - Department/function
- `phone` - Direct phone
- `linkedin_url` - LinkedIn profile

## Output Example

### Enrichment Results
```markdown
# Enrichment Results

**Object:** Account
**Records Processed:** 100
**Fields Enriched:** 245

## Summary
| Field | Found | Applied | Skipped | Avg Confidence |
|-------|-------|---------|---------|----------------|
| industry | 82 | 78 | 4 | 4.2 |
| employee_count | 67 | 64 | 3 | 4.0 |
| website | 45 | 45 | 0 | 4.8 |

## Sample Enrichments
### Acme Corporation (001xxx001)
| Field | Before | After | Source | Confidence |
|-------|--------|-------|--------|------------|
| industry | null | Technology | company_website | 5 |
| employee_count | null | 250-500 | linkedin | 4 |
| founded_year | null | 2015 | company_website | 4 |

## Skipped Records
- 001xxx045: Protected (GDPR consent required)
- 001xxx067: Rate limited (retry in 10 min)
```

### JSON Output
```json
{
  "processed": 100,
  "enriched": {
    "total": 245,
    "byField": {
      "industry": 78,
      "employee_count": 64,
      "website": 45
    }
  },
  "skipped": {
    "protected": 4,
    "rateLimited": 2,
    "noMatch": 12
  },
  "averageConfidence": 4.2,
  "sources": {
    "company_website": 120,
    "linkedin": 95,
    "web_search": 30
  }
}
```

## Early Termination

The pipeline stops processing a record when:
1. All required fields reach confidence threshold (4+)
2. Maximum iterations reached (default: 3)
3. Rate limit exceeded
4. Protected record detected

This saves API costs and processing time.

## Protected Fields

These fields are NEVER auto-enriched:
- `do_not_call`, `do_not_email`
- `gdpr_consent`, `ccpa_opt_out`
- `email_opt_out`
- `lead_source` (except if explicitly requested)

## Governance Integration

- **Compliance Check**: GDPR/CCPA records require consent before enrichment
- **Rate Limits**: Respects API limits per source
- **Audit Trail**: All enrichments logged with source attribution
- **Rollback**: Original values preserved for potential rollback

## Related Commands

- `/data-quality-audit` - Full audit including enrichment gap analysis
- `/data-health` - Quick health check
- `/review-queue` - Process pending enrichment approvals

## CLI Usage

```bash
# Run enrichment via script
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/enrichment/run-enrichment.js \
  --object Account \
  --fields industry,employee_count \
  --source auto \
  --confidence 4 \
  --input ./reports/account-export.json

# Check enrichment status
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/enrichment/status.js
```

## Configuration

```bash
# Set confidence threshold
export ENRICHMENT_CONFIDENCE=4

# Set default sources
export ENRICHMENT_SOURCES=website,linkedin

# Enable dry-run
export ENRICHMENT_DRY_RUN=1

# Set rate limit (requests per minute)
export ENRICHMENT_RATE_LIMIT=30
```

## Examples

### Fill missing company data
```bash
/enrich-data --object Account --fields industry,employee_count,website
```

### Enrich contacts with job details
```bash
/enrich-data --object Contact --fields title,seniority,department --confidence 4
```

### Preview enrichment without changes
```bash
/enrich-data --object Account --fields industry --dry-run
```
