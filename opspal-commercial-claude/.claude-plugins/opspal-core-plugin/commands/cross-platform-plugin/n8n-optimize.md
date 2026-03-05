---
description: Analyze n8n workflow performance and generate optimization recommendations
argument-hint: "<workflow-id> [--quick] [--json]"
---

# n8n Workflow Optimization Analysis

Analyze n8n workflow performance and generate optimization recommendations.

## Usage

```
/n8n-optimize <workflow-id> [--quick]
```

## Options

- `--quick` - Summary mode with efficiency score only
- `--json` - Output in JSON format

## Analysis Types

### Full Analysis (Default)
```
/n8n-optimize abc123
```

Provides:
- Efficiency Score (0-100 with grade)
- Scoring factor breakdown
- Top 5 bottlenecks
- Error rate and categories
- Prioritized recommendations

### Quick Analysis
```
/n8n-optimize abc123 --quick
```

Provides:
- Efficiency Score and Grade only
- Good for monitoring dashboards

## Environment Setup

Before using this command, ensure these environment variables are set:

```bash
export N8N_API_KEY=your-api-key
export N8N_BASE_URL=https://your-instance.n8n.cloud
```

## Examples

### Full Workflow Analysis
```
/n8n-optimize abc123
```

Output:
```
============================================================
Analysis for Daily Sync Workflow
============================================================

Efficiency Score: 72/100 (Grade: C)

Scoring Factors:
┌─────────────────┬───────────┬────────┬────────┐
│ Factor          │ Value     │ Impact │ Status │
├─────────────────┼───────────┼────────┼────────┤
│ Error Rate      │ 8.5%      │ -9     │ FAIR   │
│ Error Handling  │ Missing   │ -10    │ POOR   │
│ Execution Speed │ 45s (p95) │ +0     │ GOOD   │
│ Complexity      │ 18 nodes  │ +0     │ GOOD   │
│ Consistency     │ 2.1x var  │ -5     │ FAIR   │
└─────────────────┴───────────┴────────┴────────┘

Bottlenecks (slowest nodes):
┌──────────────────────┬─────────────┬─────────────┐
│ nodeName             │ avgDuration │ maxDuration │
├──────────────────────┼─────────────┼─────────────┤
│ Salesforce Query     │ 12500ms     │ 28000ms     │
│ Transform Data       │ 8200ms      │ 15000ms     │
│ HubSpot Update       │ 5400ms      │ 12000ms     │
└──────────────────────┴─────────────┴─────────────┘

Recommendations:

1. [HIGH] No error handling
   Action: Add Error Trigger node to catch and handle failures
   Impact: Prevents silent failures and data loss

2. [MEDIUM] Rate limiting detected
   Action: Add Wait nodes between API calls or reduce batch sizes
   Impact: Reduces failures from transient errors

3. [LOW] No rate limiting between API calls
   Action: Add Wait nodes to prevent rate limiting
   Impact: Prevents API throttling and failures
```

### Quick Score Check
```
/n8n-optimize abc123 --quick
```

Output:
```
Efficiency Score: 72/100 (Grade: C)
```

### Compare Two Workflows
For detailed comparison, use the underlying script:
```bash
node scripts/lib/n8n-workflow-optimizer.js compare abc123 def456
```

## Score Interpretation

| Grade | Score | Meaning |
|-------|-------|---------|
| A | 90-100 | Excellent - well optimized |
| B | 80-89 | Good - minor improvements possible |
| C | 70-79 | Fair - several optimization opportunities |
| D | 60-69 | Poor - significant issues to address |
| F | 0-59 | Critical - major overhaul needed |

## Scoring Factors

### Error Rate (-5 to -30 points)
- <5%: GOOD (no penalty)
- 5-15%: FAIR (-5 to -15)
- >15%: POOR (-15 to -30)

### Error Handling (-10 or +0)
- Present: GOOD (+0)
- Missing: POOR (-10)

### Execution Speed (-0 to -15)
- <60s p95: GOOD (+0)
- 60-120s: FAIR (-5)
- >120s: POOR (-15)

### Complexity (-0 to -10)
- <20 nodes: GOOD (+0)
- 20-30 nodes: FAIR (-5)
- >30 nodes: POOR (-10)

### Consistency (-0 to -10)
- <2x variance: GOOD (+0)
- 2-5x variance: FAIR (-5)
- >5x variance: POOR (-10)

## Common Recommendations

### HIGH Priority
- **No error handling** → Add Error Trigger node
- **Authentication failures** → Refresh credentials
- **Server errors** → Add retry with backoff

### MEDIUM Priority
- **Rate limiting** → Add Wait nodes, reduce batch size
- **Slow execution** → Split workflow, optimize transformations
- **Timeouts** → Increase timeout, add retries

### LOW Priority
- **No rate limiting** → Add delays between API calls
- **Validation errors** → Add input validation nodes

## Related Commands

- `/n8n-lifecycle` - Manage workflow states
- `/n8n-status` - Check n8n connection

## Related Agent

For complex optimization tasks, use the `n8n-optimizer` agent:
```
Optimize my workflow abc123 and implement the recommendations
```

## Troubleshooting

### "N8N_API_KEY required"
Set the environment variable:
```bash
export N8N_API_KEY=your-api-key
```

### "No execution data"
The workflow needs execution history for analysis. Run the workflow a few times first.

### Low sample size warning
For accurate analysis, workflows should have at least 10-20 executions. Results may be unreliable with fewer samples.
