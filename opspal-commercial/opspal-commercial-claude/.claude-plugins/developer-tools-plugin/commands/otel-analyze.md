---
name: otel-analyze
description: Analyze OpenTelemetry metrics and generate insights
---

Analyze OpenTelemetry metrics from Claude Code and optionally create reflection entries for quality issues.

## Usage

```bash
# Basic analysis (agent performance, costs, quality)
node .claude-plugins/developer-tools-plugin/scripts/lib/otel-metrics-analyzer.js

# Analyze and create reflection entries for issues
node .claude-plugins/developer-tools-plugin/scripts/lib/otel-reflection-integrator.js

# Specify custom metrics file
node .claude-plugins/developer-tools-plugin/scripts/lib/otel-metrics-analyzer.js /path/to/metrics.json
```

## What It Does

1. **Loads OTel metrics** from `.otel/metrics.json` (or specified file)
2. **Analyzes metrics** for:
   - Agent performance (duration, token usage, success rate)
   - Cost breakdown by plugin
   - Quality metrics (error rates, error types)
   - Common workflow patterns
3. **Generates insights**:
   - Top 10 most-used agents
   - Cost per plugin
   - Error rate analysis
   - Workflow chains

## Reflection Integration

The `otel-reflection-integrator.js` script automatically detects:

- **High error rates** (>15%) → CRITICAL reflection
- **Moderate error rates** (5-15%) → WARNING reflection
- **Slow performance** (P95 > 30s) → WARNING reflection
- **High token usage** (>10k avg) → INFO reflection

Reflections are:
1. Saved to `.otel/reflections/reflection-YYYY-MM-DD.json`
2. Uploaded to Supabase (if configured)
3. Can be processed with `/processreflections` command

## Prerequisites

1. **OTel Collector Running**:
   ```bash
   bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-quickstart.sh status
   ```

2. **Claude Code Configured**:
   ```bash
   export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
   ```

3. **Metrics Exist**:
   ```bash
   ls -lah .otel/metrics.json
   ```

## Example Output

```
═══════════════════════════════════════════════════════════════════════════════
  RevPal Agent System - OpenTelemetry Metrics Report
═══════════════════════════════════════════════════════════════════════════════

🤖 Agent Performance Analysis

Top 10 Most Used Agents:
────────────────────────────────────────────────────────────────────────────────
1. sfdc-cpq-assessor
   Invocations: 45
   Avg Duration: 12500ms
   Avg Tokens: 8500
   Error Rate: 2.2%

2. release-coordinator
   Invocations: 32
   Avg Duration: 8200ms
   Avg Tokens: 5400
   Error Rate: 0.0%


💰 Cost Analysis

Total Tokens: 456,789
Estimated Cost: $1.37

Cost by Plugin:
────────────────────────────────────────────────────────────────
salesforce-plugin              285,432 tokens   $0.86  (62.5%)
hubspot-plugin                 98,765 tokens    $0.30  (21.6%)


🎯 Quality Metrics

Total Invocations: 156
Total Errors: 8
Error Rate: 5.13%

Errors by Type:
────────────────────────────────────────────────────────────────
timeout                              5 errors  (62.5%)
api_error                            2 errors  (25.0%)
```

## Integration with Existing Workflow

```bash
# 1. Run periodic analysis (daily/weekly)
node .claude-plugins/developer-tools-plugin/scripts/lib/otel-metrics-analyzer.js

# 2. Create reflections for issues
node .claude-plugins/developer-tools-plugin/scripts/lib/otel-reflection-integrator.js

# 3. Process reflections with existing system
/processreflections

# 4. Review and implement fixes
```

## Automation

Add to cron for automatic monitoring:

```bash
# Daily at 9 AM
0 9 * * * cd /path/to/opspal-internal-plugins && node .claude-plugins/developer-tools-plugin/scripts/lib/otel-reflection-integrator.js >> .otel/cron.log 2>&1
```

## Troubleshooting

**No metrics file found**:
```bash
# Check collector is running
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-quickstart.sh status

# Verify metrics directory
ls -la .otel/
```

**Empty metrics**:
- Claude Code may not be exporting yet
- Restart Claude Code after setting OTEL_EXPORTER_OTLP_ENDPOINT
- Wait a few minutes for metrics to accumulate

**Permission errors**:
```bash
chmod +x .claude-plugins/developer-tools-plugin/scripts/lib/otel-metrics-analyzer.js
chmod +x .claude-plugins/developer-tools-plugin/scripts/lib/otel-reflection-integrator.js
```

## See Also

- [OTel Quick Start Guide](../../docs/OTEL_QUICKSTART.md)
- [Full Integration Plan](../../docs/OTEL_INTEGRATION_PLAN.md)
- Claude Code Docs: https://code.claude.com/docs/en/monitoring-usage
