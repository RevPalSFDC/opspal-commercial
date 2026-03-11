---
name: pdf-read
description: Intelligently read large PDFs using page ranges. Analyzes PDF structure and returns relevant pages for queries. Uses Claude Code v2.1.30+ pages parameter.
allowed-tools: Read, Bash, Glob
---

# PDF Context Optimizer Skill

This skill helps you efficiently read large PDF documents by analyzing their structure and selecting relevant page ranges.

## Quick Start

```bash
/pdf-read <path-to-pdf> [query]
```

## When to Use

- Reading large assessment reports or audits (>10 pages)
- Extracting specific sections from documentation
- Processing Salesforce configuration exports
- Analyzing compliance or regulatory documents

## How It Works

1. **Analyze Structure** - Scans PDF to estimate sections (executive summary, findings, appendix, etc.)
2. **Match Query** - Maps your query to relevant sections using keyword patterns
3. **Return Page Ranges** - Provides optimal page ranges for Claude Code's Read tool

## Claude Code v2.1.30+ Integration

This skill leverages the new `pages` parameter:
- Maximum 20 pages per Read request
- Format: `pages="1-5,10-15"`
- Large PDFs (>10 pages) return lightweight references when @-mentioned

## Document Type Detection

The optimizer auto-detects document types from filename/path:

| Type | Patterns | Example Sections |
|------|----------|------------------|
| Salesforce | `sfdc`, `salesforce` | Objects, Validation Rules, Flows, Permissions |
| HubSpot | `hubspot`, `hs` | Workflows, Properties, Contacts, Forms |
| Audit | `audit`, `assessment` | Executive Summary, Findings, Recommendations |
| Report | `report` | Overview, Metrics, Analysis, Appendix |

## Section Patterns (Salesforce)

| Section | Keywords |
|---------|----------|
| validation_rules | validation rule, vr, formula field |
| flows | flow, process builder, automation, trigger |
| permissions | permission, profile, role, sharing, access |
| objects | object, field, relationship, lookup |
| cpq | cpq, quote, pricing, product, bundle |

## Commands

```bash
# Analyze PDF structure
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/pdf-context-optimizer.js analyze ./report.pdf

# Get relevant pages for a query
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/pdf-context-optimizer.js pages ./audit.pdf "validation rules"

# Get chunking strategy for large PDFs
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/pdf-context-optimizer.js chunks ./large-doc.pdf

# Clear PDF structure cache
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/pdf-context-optimizer.js clear-cache
```

## Example Workflow

```
User: /pdf-read ./acme-audit.pdf "what are the CPQ findings"

System: Analyzing PDF structure...
  - Document type: audit
  - Total pages: 45
  - Detected sections: executive_summary (1-5), findings (6-25), recommendations (26-35), appendix (36-45)

Relevant sections for "CPQ findings":
  - findings (pages 6-25) - Primary match
  - recommendations (pages 26-35) - Secondary match

Recommended Read command:
  Read(file_path="./acme-audit.pdf", pages="6-25")

[Claude then reads those specific pages]
```

## Configuration

**Cache**: PDF structure is cached for 24 hours in `.claude/data/pdf-cache/`

**Environment Variables**:
| Variable | Default | Description |
|----------|---------|-------------|
| `PDF_CACHE_TTL_HOURS` | 24 | Cache time-to-live |
| `PDF_MAX_PAGES_PER_READ` | 20 | Max pages per Read call |

## Tips

- For very large PDFs (100+ pages), use the chunking strategy to read in batches
- The optimizer estimates sections - actual content may vary
- When in doubt, read the executive summary first (usually pages 1-5)
- Use specific queries like "validation rules" rather than vague ones like "issues"

## Files

- **Script**: `plugins/opspal-core/scripts/lib/pdf-context-optimizer.js`
- **Cache**: `.claude/data/pdf-cache/`