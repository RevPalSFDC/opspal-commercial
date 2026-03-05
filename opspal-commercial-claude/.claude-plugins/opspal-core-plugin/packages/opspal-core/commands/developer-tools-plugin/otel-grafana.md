---
name: otel-grafana
description: Set up and manage Grafana dashboard for Claude Code metrics
---

Launch a Grafana dashboard to visualize Claude Code agent metrics in real-time.

## Quick Start (5 Minutes)

```bash
# 1. Enable Prometheus exporter in OTel Collector
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh enable-prometheus

# 2. Restart OTel Collector
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/otel-quickstart.sh restart

# 3. Start Grafana + Prometheus (Docker)
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh start-stack

# 4. Open Grafana
# http://localhost:3333 (login: admin/admin)
```

## What You Get

### 📊 Real-Time Dashboard

The dashboard includes 9 panels showing:

1. **Total Agent Invocations** - How many times agents have run
2. **Average Agent Duration** - How long agents take to execute
3. **Success Rate** - Percentage of successful agent runs
4. **Total Token Usage** - Tokens consumed across all agents
5. **Agent Invocations Over Time** - Trend graph by agent type
6. **Average Duration by Agent** - Performance comparison
7. **Token Usage by Plugin** - Cost breakdown pie chart
8. **Error Rate by Agent** - Quality metrics over time
9. **Errors by Type** - Error distribution (timeout, API error, etc.)

### 🎯 Key Metrics

**Agent Performance:**
- Invocation counts and rates
- Duration (avg, min, max, P95)
- Success/failure rates

**Cost Analysis:**
- Token consumption per agent
- Token consumption per plugin
- Estimated costs ($3/1M tokens)

**Quality Monitoring:**
- Error rates over time
- Error types breakdown
- Top failing agents

**Workflow Analytics:**
- Active workflows
- Agent chain patterns
- Complexity distribution

## Management Commands

```bash
# Check status
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh status

# Start stack
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh start-stack

# Stop stack
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh stop-stack

# Enable Prometheus (if not already)
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh enable-prometheus
```

## Access Points

- **Grafana**: http://localhost:3333 (admin/admin)
- **Prometheus**: http://localhost:9090
- **OTel Metrics**: http://localhost:8889/metrics

## Prerequisites

1. **Docker installed and running**:
   ```bash
   docker --version
   docker ps
   ```

2. **OTel Collector running**:
   ```bash
   bash .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/otel-quickstart.sh status
   ```

3. **Claude Code configured**:
   ```bash
   echo $OTEL_EXPORTER_OTLP_ENDPOINT
   # Should output: http://localhost:4318
   ```

## Verification Steps

```bash
# 1. Check OTel Collector is exporting Prometheus metrics
curl http://localhost:8889/metrics | grep claude_code

# 2. Check Prometheus is scraping
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[0].health'
# Should output: "up"

# 3. Check Grafana is running
curl http://localhost:3333/api/health
# Should output: {"commit":"...","database":"ok","version":"..."}

# 4. Test a query in Prometheus
curl -G http://localhost:9090/api/v1/query --data-urlencode 'query=claude_code_agent_invocations_total'
```

## Customizing the Dashboard

### Add New Panels

1. Open Grafana: http://localhost:3333
2. Navigate to the "Claude Code Agent Metrics" dashboard
3. Click "Add panel" → "Add a new panel"
4. Enter PromQL query (see examples below)
5. Configure visualization type
6. Save dashboard

### Example PromQL Queries

**Most invoked agents:**
```promql
topk(10, sum by (agent_type) (claude_code_agent_invocations_total))
```

**Slowest agents (P95):**
```promql
histogram_quantile(0.95, sum by (agent_type, le) (rate(claude_code_agent_duration_bucket[5m])))
```

**Cost per agent:**
```promql
sum by (agent_type) (claude_code_agent_tokens_total) * 3 / 1000000
```

**Error rate threshold alert:**
```promql
sum(rate(claude_code_agent_errors_total[5m])) / sum(rate(claude_code_agent_invocations_total[5m])) > 0.15
```

### Export Dashboard

```bash
# From Grafana UI
# 1. Open dashboard
# 2. Click "Share" → "Export"
# 3. Save JSON

# Or via API
curl -H "Authorization: Bearer <api-key>" \
  http://localhost:3333/api/dashboards/uid/claude-code-metrics \
  | jq .dashboard > my-dashboard.json
```

## Alerting (Optional)

### Configure Slack Notifications

1. In Grafana, go to "Alerting" → "Contact points"
2. Add new contact point:
   - Name: Slack
   - Type: Slack
   - Webhook URL: `$SLACK_WEBHOOK_URL`
3. Create alert rules (see examples below)

### Example Alert Rules

**High Error Rate:**
- Query: `sum(rate(claude_code_agent_errors_total[5m])) / sum(rate(claude_code_agent_invocations_total[5m])) > 0.15`
- Threshold: > 15%
- Action: Send to Slack + Create reflection

**Slow Agent:**
- Query: `histogram_quantile(0.95, sum by (agent_type, le) (rate(claude_code_agent_duration_bucket[5m]))) > 30000`
- Threshold: P95 > 30s
- Action: Send to Slack

**High Token Usage:**
- Query: `rate(claude_code_agent_tokens_total[1m]) > 10000`
- Threshold: > 10k tokens/min
- Action: Send to Slack

## Troubleshooting

### No metrics in Grafana

**Check OTel Collector:**
```bash
curl http://localhost:8889/metrics | grep claude_code
# Should show metrics
```

**Check Prometheus targets:**
```bash
# Open: http://localhost:9090/targets
# Should show "otel-collector" as UP
```

**Verify data in Prometheus:**
```bash
# Open: http://localhost:9090/graph
# Query: claude_code_agent_invocations_total
# Should show time series data
```

### Docker containers not starting

```bash
# Check Docker daemon
sudo systemctl status docker

# Check logs
docker-compose -f .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/docker/otel-stack.yml logs

# Restart stack
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh stop-stack
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh start-stack
```

### Grafana shows "No Data"

- Wait 2-3 minutes for metrics to accumulate
- Verify Claude Code is running with OTel export enabled
- Check time range in dashboard (should be "Last 6 hours")
- Run some agent tasks to generate metrics

## Advanced: Native Installation

If you prefer not to use Docker:

```bash
# Install Prometheus
sudo apt-get install prometheus

# Install Grafana
sudo apt-get install grafana

# Configure manually
# See: docs/OTEL_GRAFANA_SETUP.md
```

## Integration with Existing Tools

### Reflection System
Use Grafana alerts to auto-create reflections:
```bash
# Configure webhook to trigger:
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/otel-reflection-integrator.js
```

### Asana
Create tasks from critical alerts:
```bash
# Webhook handler that creates Asana task from Grafana alert
```

### Cost Tracking
Export cost data to spreadsheet:
```bash
# Query Prometheus for token usage
curl -G http://localhost:9090/api/v1/query_range \
  --data-urlencode 'query=sum(claude_code_agent_tokens_total)' \
  --data-urlencode 'start=...' \
  --data-urlencode 'end=...' \
  | jq -r '.data.result[0].values[] | @csv' > token_usage.csv
```

## See Also

- [Full Grafana Setup Guide](../../docs/OTEL_GRAFANA_SETUP.md)
- [OTel Quick Start](../../docs/OTEL_QUICKSTART.md)
- [OTel Integration Plan](../../docs/OTEL_INTEGRATION_PLAN.md)
- Reddit Thread: https://www.reddit.com/r/ClaudeCode/comments/1pjon1r/

## Cost

**Self-Hosted (Docker)**: Free
**Grafana Cloud**: Free tier available, then $50/mo
**Recommended**: Self-hosted for privacy and zero cost
