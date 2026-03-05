# OpenTelemetry Quick Start Guide

Get OpenTelemetry metrics from Claude Code up and running in 10 minutes.

## 🚀 Quick Setup

### 1. Install and Start OTel Collector

```bash
# Setup (one-time)
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-quickstart.sh setup

# Start collector
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-quickstart.sh start

# Check status
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-quickstart.sh status
```

### 2. Configure Your Shell

```bash
# Add to ~/.bashrc or ~/.zshrc
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_SERVICE_NAME="revpal-agent-system"
export OTEL_METRICS_EXPORTER="otlp"
export OTEL_TRACES_EXPORTER="otlp"

# Apply changes
source ~/.bashrc  # or source ~/.zshrc
```

### 3. Restart Claude Code

```bash
# Exit Claude Code and restart
# Metrics will now be exported automatically
```

### 4. View Metrics

```bash
# Wait a few minutes for metrics to accumulate, then:
node .claude-plugins/developer-tools-plugin/scripts/lib/otel-metrics-analyzer.js

# Or specify a different metrics file
node .claude-plugins/developer-tools-plugin/scripts/lib/otel-metrics-analyzer.js /path/to/metrics.json
```

## 📊 What You'll Get

### Agent Performance Report
```
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
```

### Cost Analysis
```
Total Tokens: 456,789
Estimated Cost: $1.37

Cost by Plugin:
────────────────────────────────────────────────────────────────
salesforce-plugin              285,432 tokens   $0.86  (62.5%)
hubspot-plugin                 98,765 tokens    $0.30  (21.6%)
opspal-core          72,592 tokens    $0.22  (15.9%)
```

### Quality Metrics
```
Total Invocations: 156
Total Errors: 8
Error Rate: 5.13%

Errors by Type:
────────────────────────────────────────────────────────────────
timeout                              5 errors  (62.5%)
api_error                            2 errors  (25.0%)
validation_error                     1 errors  (12.5%)
```

### Workflow Patterns
```
Common Agent Chains:
────────────────────────────────────────────────────────────────
12x: sequential-planner → sfdc-state-discovery → sfdc-conflict-resolver
8x: release-coordinator → sfdc-metadata → hubspot-workflow
5x: quality-control-analyzer → docs-keeper
```

## 🎯 Next Steps

### Option A: Local Analysis (Immediate)
You're already set up! Just run the analyzer periodically:
```bash
# Daily/weekly
node .claude-plugins/developer-tools-plugin/scripts/lib/otel-metrics-analyzer.js
```

### Option B: Supabase Integration (Persistent Storage)
Store metrics in Supabase for historical analysis:

1. **Create Supabase Table**:
   ```sql
   -- Run in Supabase SQL Editor
   CREATE TABLE claude_code_metrics (
     id BIGSERIAL PRIMARY KEY,
     timestamp TIMESTAMPTZ NOT NULL,
     metric_name TEXT NOT NULL,
     metric_value DOUBLE PRECISION NOT NULL,
     agent_type TEXT,
     plugin_name TEXT,
     task_complexity TEXT,
     success BOOLEAN,
     error_type TEXT,
     token_count INTEGER,
     duration_ms INTEGER,
     attributes JSONB,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE INDEX idx_metrics_timestamp ON claude_code_metrics(timestamp);
   CREATE INDEX idx_metrics_agent ON claude_code_metrics(agent_type);
   ```

2. **Create Supabase Edge Function** (see below)

3. **Update OTel Collector Config**:
   ```yaml
   # Edit .otel/config.yaml
   exporters:
     otlphttp:
       endpoint: https://your-project.supabase.co/functions/v1/otel-ingest
       headers:
         apikey: ${SUPABASE_ANON_KEY}
   ```

### Option C: Grafana Dashboards (Visualization)
Set up Grafana for real-time dashboards:

1. Install Grafana
2. Add Prometheus data source (via OTel Collector)
3. Import dashboard from `docs/grafana-dashboards/`

## 🔧 Supabase Edge Function

Create this function in Supabase:

```typescript
// supabase/functions/otel-ingest/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const otelData = await req.json()

    // Parse OTel data
    const metrics = otelData.resourceMetrics?.[0]?.scopeMetrics?.[0]?.metrics || []

    const records = metrics.flatMap(metric => {
      return metric.dataPoints?.map(dp => {
        const attributes = Object.fromEntries(
          (dp.attributes || []).map(a => [a.key, a.value?.stringValue || a.value?.intValue || a.value?.boolValue])
        )

        return {
          timestamp: new Date(parseInt(dp.timeUnixNano) / 1_000_000),
          metric_name: metric.name,
          metric_value: dp.asInt || dp.asDouble || 0,
          agent_type: attributes['agent.type'],
          plugin_name: attributes['plugin.name'],
          task_complexity: attributes['task.complexity'],
          success: attributes['agent.success'],
          error_type: attributes['agent.error_type'],
          token_count: attributes['agent.token_count'],
          duration_ms: attributes['agent.duration_ms'],
          attributes: attributes
        }
      }) || []
    })

    // Insert into Supabase
    const { error } = await supabase
      .from('claude_code_metrics')
      .insert(records)

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, inserted: records.length }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

Deploy:
```bash
supabase functions deploy otel-ingest
```

## 🚨 Troubleshooting

### Collector Not Starting
```bash
# Check logs
cat .otel/collector.log

# Verify binary
ls -lah .otel/otelcol

# Re-download
rm .otel/otelcol
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-quickstart.sh setup
```

### No Metrics Appearing
```bash
# Verify environment variables
echo $OTEL_EXPORTER_OTLP_ENDPOINT

# Check Claude Code is sending data
# Look for OTel-related logs in Claude Code output

# Verify collector is receiving data
tail -f .otel/collector.log
```

### Permission Denied
```bash
chmod +x .otel/otelcol
chmod +x .claude-plugins/developer-tools-plugin/scripts/lib/otel-quickstart.sh
```

## 📚 Advanced Usage

### Custom Metrics
Add custom attributes to your agent invocations:
```javascript
// In agent code
process.env.OTEL_RESOURCE_ATTRIBUTES = 'agent.type=my-agent,complexity=HIGH'
```

### Alerting
Set up alerts based on metrics:
```bash
# Example: Alert on high error rate
if error_rate > 0.15:
  send_slack_notification()
  create_reflection_entry()
```

### Cost Optimization
Use metrics to optimize:
- Switch expensive agents to Haiku model
- Identify and fix timeout-prone operations
- Consolidate redundant agent invocations

## 🔗 Resources

- [Claude Code Monitoring Docs](https://code.claude.com/docs/en/monitoring-usage)
- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [Full Integration Plan](./OTEL_INTEGRATION_PLAN.md)

## ⏱️ Time Investment

- **Setup**: 10 minutes
- **Basic analysis**: 5 minutes/week
- **Supabase integration**: 1 hour (one-time)
- **Grafana dashboards**: 2-3 hours (one-time)

## 💰 Expected ROI

Based on current usage patterns:
- **Token optimization**: 15-20% reduction → $75-100/mo saved
- **Error reduction**: 25% fewer retries → 3-5 hours/mo saved
- **Workflow optimization**: 10% faster execution → 2-3 hours/mo saved

**Total estimated value**: $300-500/mo for ~4 hours of setup time.
