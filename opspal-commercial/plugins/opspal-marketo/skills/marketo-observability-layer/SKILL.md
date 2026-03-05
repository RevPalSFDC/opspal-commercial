---
name: marketo-observability-layer
description: Claude-powered continuous marketing intelligence using Marketo Bulk Extract APIs
version: 1.0.0
keywords:
  - observability
  - bulk extract
  - continuous intelligence
  - marketing analytics
  - ai recommendations
triggers:
  - "observability"
  - "bulk extract"
  - "continuous intelligence"
  - "marketing metrics"
  - "claude analysis"
  - "performance recommendations"
---

# Marketo Observability Layer Skill

Claude-powered continuous marketing intelligence that automates data extraction, analysis, and recommendations using Marketo's Bulk Extract APIs.

## Capability Summary

### Data Extraction
- **Leads**: Export person records with demographics, scores, and custom fields
- **Activities**: Export event logs (email opens, clicks, form fills, web visits)
- **Program Members**: Export campaign membership and progression status

### Intelligence Analysis
- **Performance**: Campaign and email effectiveness metrics
- **Engagement**: Lead behavior patterns and optimal send times
- **Funnel**: Conversion rates and bottleneck identification
- **Anomaly**: Detection of unusual patterns and metric deviations

### Automated Actions
- **Auto-implement**: Low-risk changes (tokens, wait times)
- **Approval queue**: High-risk changes (flows, segmentation)
- **Impact measurement**: Before/after comparison with rollback capability

## Quick Reference

### Commands
| Command | Purpose |
|---------|---------|
| `/observability-setup` | Configure the observability layer |
| `/observability-dashboard` | View current metrics and status |
| `/extract-wizard` | Interactive bulk export configuration |
| `/analyze-performance` | Trigger Claude-powered analysis |

### Agents
| Agent | Purpose |
|-------|---------|
| `marketo-observability-orchestrator` | Master coordinator for all operations |
| `marketo-data-normalizer` | Transform exports to AI-ready format |
| `marketo-intelligence-analyst` | Claude-powered analysis and recommendations |

## API Constraints

| Constraint | Limit |
|------------|-------|
| Daily export quota | 500 MB |
| Date range per job | 31 days max |
| Concurrent exports | 2 running |
| Queued jobs | 10 max |
| File retention | 7 days |
| Poll interval | 60s minimum |
| Rate limit | 100 calls/20s |

## Storage Structure

```
instances/{portal}/observability/
├── exports/
│   ├── leads/           # Normalized lead exports
│   ├── activities/      # Normalized activity logs
│   └── program-members/ # Normalized membership data
├── analysis/
│   ├── reports/         # Claude-generated analysis
│   └── recommendations/ # Tracked recommendations
├── metrics/
│   └── aggregations.json
└── history/
    └── feedback-loop.json
```

## Automation Rules

### Auto-Implement (No Approval Required)
- Program token value updates
- Wait step duration changes (< 50% adjustment)
- Email subject line A/B tests (draft only)

### Require Approval
- Flow step additions/removals
- Segmentation rule changes
- Smart list criteria modifications
- Campaign activation/deactivation

## Related Documentation

- `bulk-extract-patterns.md` - API patterns for exports
- `data-normalization-patterns.md` - Schema and parsing
- `analysis-prompt-patterns.md` - Claude analysis templates
- `recommendation-templates.md` - Action templates
- `continuous-loop-patterns.md` - Feedback integration

## Usage Example

```bash
# Initial setup
/observability-setup --portal=production

# Export fresh data
/extract-wizard --type=leads --days=7

# Trigger analysis
/analyze-performance --type=performance

# View status
/observability-dashboard
```
