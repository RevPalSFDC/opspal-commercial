---
description: Display routing compliance statistics and analyze agent utilization patterns
argument-hint: "[stats|recent|rate]"
---

# Routing Compliance Report

Display routing compliance statistics and analyze agent utilization patterns.

## Usage

```
/routing-compliance [subcommand]
```

## Subcommands

- (none) - Show full report
- `stats` - Show raw statistics as JSON
- `recent` - Show recent violations
- `rate` - Show compliance rate only

## What This Shows

This command analyzes the routing logs to determine how well Claude follows agent routing recommendations. It shows:

1. **Overall Compliance Rate** - Percentage of blocking recommendations that were followed
2. **Decisions by Action Type** - Breakdown of BLOCKED, RECOMMENDED, AVAILABLE, DIRECT_OK
3. **Most Ignored Agents** - Which agents are most frequently bypassed
4. **Recent Violations** - Last 24 hours of compliance violations

## Action

Run the compliance tracker to generate a report:

```bash
node ${CLAUDE_PLUGIN_ROOT}/cross-platform-plugin/scripts/lib/compliance-tracker.js report
```

## Understanding the Report

### Compliance Rate Interpretation

| Rate | Status | Action |
|------|--------|--------|
| ≥85% | ✅ Good | System working well |
| 70-84% | 📝 Moderate | Review most-ignored agents |
| <70% | ⚠️ Low | Consider lowering blocking thresholds |

### Key Metrics

- **Blocking Decisions**: Tasks where an agent was strongly recommended
- **Violations**: Times Claude used direct execution instead of the recommended agent
- **Compliance Rate**: (Blocking - Violations) / Blocking × 100

## Related Commands

- `/routing-health` - Check routing system health
- `/route <task>` - Manually analyze routing for a task

## Log Files

- Routing decisions: `~/.claude/logs/routing.jsonl`
- Compliance violations: `~/.claude/logs/compliance.jsonl`

## Troubleshooting

**No data?** Make sure you've been using Claude Code with the subagent-utilization-booster hook enabled.

**High violation rate?** Review which agents are being ignored and consider:
- Improving agent descriptions
- Adjusting keyword patterns
- Lowering complexity thresholds
