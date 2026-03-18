# Marketo Observability Layer - Overview & Architecture

## Purpose

The Marketo Observability Layer provides continuous marketing intelligence by integrating Marketo's Bulk Extract APIs with Claude-powered analysis. This creates a closed-loop system where:

1. Data is automatically extracted from Marketo (leads, activities, program members)
2. Raw exports are normalized into AI-consumable structures
3. Claude analyzes patterns, performance, and anomalies
4. Recommendations are generated for campaign optimization
5. Low-risk changes are auto-implemented; high-risk changes require approval
6. Impact is measured to continuously improve recommendations

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MARKETO OBSERVABILITY LAYER                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   MARKETO    │     │    BULK      │     │    DATA      │                │
│  │     API      │────▶│   EXTRACT    │────▶│ NORMALIZER   │                │
│  │              │     │ ORCHESTRATOR │     │              │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│         ▲                                          │                        │
│         │                                          ▼                        │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │    AUTO      │     │  CONTINUOUS  │     │ INTELLIGENCE │                │
│  │ IMPLEMENTER  │◀────│    LOOP      │◀────│   ANALYST    │                │
│  │              │     │   MANAGER    │     │   (CLAUDE)   │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Extraction Phase
```
Scheduler → Create Export Job → Enqueue → Poll Status → Download File
                   │
                   ▼
         ┌─────────────────┐
         │  Export Types   │
         ├─────────────────┤
         │ • Leads         │
         │ • Activities    │
         │ • Program Members│
         └─────────────────┘
```

### 2. Normalization Phase
```
Raw CSV → Parse Headers → Extract JSON Attributes → Map IDs → Aggregate Metrics
                                    │
                                    ▼
                          ┌─────────────────┐
                          │ Normalized Data │
                          ├─────────────────┤
                          │ • Structured JSON│
                          │ • Metrics summary│
                          │ • Historical view│
                          └─────────────────┘
```

### 3. Analysis Phase
```
Normalized Data → Performance Summary → Claude Analysis → Recommendations
                                              │
                                              ▼
                                    ┌─────────────────┐
                                    │ Recommendation  │
                                    │     Types       │
                                    ├─────────────────┤
                                    │ • Token updates │
                                    │ • Segment tweaks│
                                    │ • Flow changes  │
                                    └─────────────────┘
```

### 4. Implementation Phase
```
                           ┌─────────────────────┐
                           │  Recommendation     │
                           └─────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                                  ▼
           ┌───────────────┐                  ┌───────────────┐
           │   LOW RISK    │                  │   HIGH RISK   │
           │ Auto-implement│                  │ Queue for     │
           │               │                  │ Approval      │
           └───────┬───────┘                  └───────┬───────┘
                   │                                  │
                   ▼                                  ▼
           ┌───────────────┐                  ┌───────────────┐
           │ Execute via   │                  │ Notify user   │
           │ Marketo API   │                  │ await decision│
           └───────────────┘                  └───────────────┘
```

## Components

### Agents

| Agent | Purpose | Key Tools |
|-------|---------|-----------|
| `marketo-observability-orchestrator` | Master coordinator | All bulk MCP tools, Task |
| `marketo-data-normalizer` | CSV→JSON transformation | Read, Write, Bash |
| `marketo-intelligence-analyst` | Claude analysis | Read, Write, Task |

### Scripts

| Script | Purpose |
|--------|---------|
| `observability-scheduler.js` | Cron-like scheduling |
| `bulk-extract-orchestrator.js` | Export lifecycle management |
| `data-normalizer.js` | CSV parsing and transformation |
| `intelligence-aggregator.js` | Claude-ready data packages |
| `continuous-loop-manager.js` | Feedback loop tracking |
| `auto-implementer.js` | Low-risk change execution |

### Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| `pre-observability-extract.sh` | Before bulk_*_create | Quota validation |
| `post-extract-complete.sh` | After status=Completed | Trigger normalization |
| `observability-quota-monitor.sh` | All bulk operations | Usage tracking |
| `pre-intelligence-analysis.sh` | Before analysis | Data freshness check |

### Commands

| Command | Purpose |
|---------|---------|
| `/observability-setup` | Initial configuration |
| `/observability-dashboard` | View metrics and insights |
| `/extract-wizard` | Interactive export configuration |
| `/analyze-performance` | Trigger Claude analysis |

## Storage Structure

All observability data is stored locally in the plugin's instance directory:

```
instances/{portal}/observability/
├── exports/
│   ├── leads/                    # Normalized lead exports
│   │   └── 2025-01-13-leads.json
│   ├── activities/               # Normalized activity logs
│   │   └── 2025-01-13-activities.json
│   └── program-members/          # Normalized membership data
│       └── 2025-01-13-program-1234.json
├── analysis/
│   ├── reports/                  # Claude-generated analysis
│   │   └── 2025-01-13-campaign-analysis.md
│   └── recommendations/          # Tracked recommendations
│       └── pending-queue.json
├── metrics/
│   └── aggregations.json         # Computed metrics over time
└── history/
    └── feedback-loop.json        # Implementation tracking
```

## Prerequisites

### Marketo Requirements
- REST API credentials (Client ID/Secret)
- Identity and Endpoint URLs
- Bulk Extract API access enabled
- Sufficient daily export quota (500 MB default)

### Plugin Requirements
- Marketo plugin v2.4.0+ (with bulk MCP tools)
- Active Marketo instance authentication
- Write access to instances directory

### Environment
- Node.js 18+ for script execution
- Bash shell for hooks
- Claude Code with Task tool access

## API Constraints

| Constraint | Limit | Impact |
|------------|-------|--------|
| Daily export quota | 500 MB | Limits total data extracted per day |
| Date range | 31 days max | Requires splitting for longer periods |
| Concurrent exports | 2 running | Must queue additional jobs |
| Queued jobs | 10 max | Must wait for slots |
| Poll interval | 60s minimum | Affects job completion detection |
| File retention | 7 days | Must download promptly |
| Rate limit | 100 calls/20s | Shared with all API operations |

## Automation Levels

### Auto-Implement (No Approval Required)
- Program token value updates
- Wait step duration changes (< 50% adjustment)
- Email subject line A/B tests

### Require Approval
- Flow step additions/removals
- Segmentation rule changes
- Smart list criteria modifications
- Campaign activation/deactivation

## Getting Started

1. **Setup**: Run `/observability-setup` to configure the layer
2. **First Export**: Run `/extract-wizard` to perform initial data extraction
3. **Analysis**: Run `/analyze-performance` to generate insights
4. **Monitor**: Use `/observability-dashboard` to track ongoing metrics

## Related Runbooks

- [02-bulk-export-automation.md](./02-bulk-export-automation.md) - Export configuration details
- [03-queuing-polling-download.md](./03-queuing-polling-download.md) - Rate limit handling
- [04-data-normalization.md](./04-data-normalization.md) - Data transformation patterns
- [05-claude-analysis-patterns.md](./05-claude-analysis-patterns.md) - AI interpretation strategies
- [06-recommendations-actions.md](./06-recommendations-actions.md) - Taking action on insights
- [07-storage-retention.md](./07-storage-retention.md) - Data persistence
- [08-continuous-intelligence.md](./08-continuous-intelligence.md) - Feedback loop
