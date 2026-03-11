---
description: Run ACE Framework maintenance tasks (health check, confidence decay, cache cleanup, metrics)
argument-hint: "[--task health|decay|cleanup|report]"
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
---

# ACE Framework Maintenance

Run maintenance tasks for the ACE (Agentic Context Engineering) Framework to ensure routing optimization stays healthy.

## Tasks Performed

1. **Health Check** - Validates all ACE components are working
2. **Confidence Decay** - Reduces confidence for stale/underperforming skills
3. **Cache Cleanup** - Removes expired cache files
4. **Metrics Summary** - Reports on agent performance trends

## Usage

```bash
# Run full maintenance
/ace-maintenance

# Run specific task
/ace-maintenance --task health
/ace-maintenance --task decay
/ace-maintenance --task cleanup
/ace-maintenance --task report
```

## Scheduled Execution

Add to task scheduler for weekly maintenance:

```bash
/schedule-add --name="ACE Weekly Maintenance" \
  --type=script \
  --schedule="0 3 * * 0" \
  --command="node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/ace-maintenance-runner.js"
```

## Output

The command outputs:
- Health status of all ACE components
- Skills that received confidence decay
- Cache files cleaned up
- Agent performance summary (top/low performers)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_ACE_ROUTING` | `1` | Enable ACE routing integration |
| `SKILL_STALENESS_DAYS` | `30` | Days before skill is considered stale |
| `SKILL_STALENESS_DECAY` | `0.02` | Decay rate per day for stale skills |
| `SKILL_MIN_CONFIDENCE` | `0.3` | Minimum confidence floor |

---

**Prompt:**

Run ACE Framework maintenance to check health, apply confidence decay to stale skills, clean up expired caches, and generate a performance summary.

Steps:
1. Run ACE health check using `node .claude-plugins/opspal-core/scripts/lib/ace-health-check.js`
2. If Supabase is configured, run confidence decay: `node .claude-plugins/opspal-core/scripts/lib/strategy-confidence-decay.js`
3. Clean expired cache files in `~/.claude/cache/ace-routing/` older than 24 hours
4. Generate performance summary using `node .claude-plugins/opspal-core/scripts/lib/ace-execution-recorder.js health`
5. Output summary report
