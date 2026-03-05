# 🚀 Grafana Dashboard - 5 Minute Setup

Build the exact dashboard from the Reddit post: https://www.reddit.com/r/ClaudeCode/comments/1pjon1r/til_that_claude_code_has_opentelemetry_metrics/

## ✅ Current Status

- ✅ **OTel Collector**: Running (PID 13686)
- ✅ **Prometheus Exporter**: Enabled (port 8889)
- ⏳ **Grafana Stack**: Not started yet

## 🎯 Launch Dashboard (3 Commands)

```bash
# 1. Start Grafana + Prometheus (Docker)
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh start-stack

# 2. Wait ~30 seconds for containers to start

# 3. Open Grafana
# → http://localhost:3333
# → Login: admin/admin
```

That's it! The dashboard is pre-configured and will auto-load.

## 📊 What You'll See

### Dashboard Preview

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 Claude Code Agent Metrics                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Total Invocations    Avg Duration      Success Rate   Tokens   │
│       156                12.5s             95.2%      456,789   │
│                                                                  │
│  ┌─ Agent Invocations Over Time ─────────────────────────────┐ │
│  │                                                             │ │
│  │  sfdc-cpq-assessor ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │ │
│  │  release-coordinator ━━━━━━━━━━━━━━━━━━━                   │ │
│  │  sequential-planner ━━━━━━━━━━━━━                          │ │
│  │                                                             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Token Usage by Plugin ─┐  ┌─ Error Rate by Agent ────────┐ │
│  │                          │  │                               │ │
│  │  🔵 salesforce  62.5%   │  │  5.13% overall                │ │
│  │  🟢 hubspot     21.6%   │  │                               │ │
│  │  🟡 cross-plat  15.9%   │  │  sfdc-cpq: 2.2%              │ │
│  │                          │  │  release: 0.0%                │ │
│  │                          │  │  planner: 3.6%                │ │
│  │                          │  │                               │ │
│  └──────────────────────────┘  └───────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Panels Included

1. **Total Agent Invocations** - Counter
2. **Average Agent Duration** - Gauge (ms)
3. **Success Rate** - Percentage gauge
4. **Total Token Usage** - Counter
5. **Agent Invocations Over Time** - Line graph
6. **Average Duration by Agent** - Multi-line graph
7. **Token Usage by Plugin** - Pie chart
8. **Error Rate by Agent** - Line graph
9. **Errors by Type** - Donut chart

## 🔧 Prerequisites Check

```bash
# ✅ Docker is required
docker --version
# Should output: Docker version 24.x.x

# ✅ OTel Collector is running
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-quickstart.sh status
# Should show: Status: ✅ Running

# ✅ Prometheus endpoint is working
curl -s http://localhost:8889/metrics | wc -l
# Should output a number > 0 (once metrics start flowing)
```

## 📝 Step-by-Step Guide

### Step 1: Start the Stack

```bash
cd /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins

bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh start-stack
```

**Expected Output:**
```
🚀 Starting Grafana + Prometheus stack...
Creating network "revpal-monitoring" with the default driver
Creating volume "revpal-prometheus-data" with default driver
Creating volume "revpal-grafana-data" with default driver
Creating revpal-prometheus ... done
Creating revpal-grafana    ... done

✅ Grafana stack started!

📊 Access Points:
   Grafana:    http://localhost:3333 (admin/admin)
   Prometheus: http://localhost:9090
```

### Step 2: Wait for Startup

```bash
# Watch containers start (optional)
docker-compose -f .claude-plugins/developer-tools-plugin/docker/otel-stack.yml logs -f

# Or just wait ~30 seconds
```

### Step 3: Access Grafana

1. **Open browser**: http://localhost:3333
2. **Login**:
   - Username: `admin`
   - Password: `admin`
   - (Change password when prompted, or skip)
3. **Navigate to dashboard**:
   - Click "Dashboards" in left sidebar
   - Click "Claude Code Agent Metrics"

### Step 4: Verify Data

```bash
# Check Prometheus is scraping
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[0].health'
# Should output: "up"

# Check metrics exist
curl -G http://localhost:9090/api/v1/query \
  --data-urlencode 'query=up' | jq
# Should show results
```

## 🎨 Customize Dashboard

Once the dashboard is loaded, you can:

- **Add panels**: Click "Add panel" button
- **Edit queries**: Click panel title → Edit
- **Change time range**: Top right (default: Last 6 hours)
- **Refresh rate**: Top right (default: Manual)
- **Export**: Click "Share" → Export → Save JSON

## 🚨 Alerting Setup (Optional)

### Configure Slack Notifications

1. In Grafana, go to **Alerting** → **Contact points**
2. Click "New contact point"
3. Fill in:
   - Name: `Slack`
   - Type: `Slack`
   - Webhook URL: Your Slack webhook
4. Save

### Create Alert Rules

**Example: High Error Rate Alert**

1. Go to **Alerting** → **Alert rules**
2. Click "New alert rule"
3. Configure:
   - **Name**: High Agent Error Rate
   - **Query**: `sum(rate(claude_code_agent_errors_total[5m])) / sum(rate(claude_code_agent_invocations_total[5m])) > 0.15`
   - **Threshold**: > 0.15 (15%)
   - **Contact point**: Slack
4. Save

## 📊 Sample Queries to Try

Once data starts flowing, try these queries in the Explore tab:

```promql
# Top 5 most invoked agents
topk(5, sum by (agent_type) (claude_code_agent_invocations_total))

# Average duration by agent
avg by (agent_type) (claude_code_agent_duration_ms)

# Error rate over time
sum(rate(claude_code_agent_errors_total[5m])) / sum(rate(claude_code_agent_invocations_total[5m]))

# Token usage trend
rate(claude_code_agent_tokens_total[5m])
```

## 🛠️ Management Commands

```bash
# Check status
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh status

# Stop stack
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh stop-stack

# Restart stack
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh stop-stack
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh start-stack

# View logs
docker-compose -f .claude-plugins/developer-tools-plugin/docker/otel-stack.yml logs -f
```

## ❓ Troubleshooting

### "Cannot connect to Docker daemon"

```bash
# Start Docker
sudo systemctl start docker

# Or on macOS
open -a Docker
```

### No metrics appearing

**Wait a few minutes** - Metrics need time to accumulate. To generate some:

1. Run Claude Code with OTel enabled
2. Invoke some agents (use Task tool)
3. Wait 2-3 minutes
4. Refresh Grafana dashboard

**Verify pipeline:**
```bash
# 1. Check OTel Collector
curl http://localhost:8889/metrics

# 2. Check Prometheus
curl http://localhost:9090/api/v1/targets

# 3. Check Grafana data source
# Open: http://localhost:3333/connections/datasources
# Click "Prometheus" → "Save & Test"
```

### Port already in use

```bash
# Find what's using port 3000 or 9090
sudo lsof -i :3000
sudo lsof -i :9090

# Stop conflicting service or change port in docker-compose.yml
```

### Dashboard not loading

```bash
# Check if containers are running
docker ps | grep -E "revpal-grafana|revpal-prometheus"

# Check logs
docker logs revpal-grafana
docker logs revpal-prometheus
```

## 🎯 Next Steps

1. **Generate some data**: Use Claude Code with agents for a few hours
2. **Explore queries**: Click panels → Edit to see PromQL queries
3. **Set up alerts**: Configure Slack notifications
4. **Share dashboard**: Export JSON and share with team
5. **Integrate with reflection system**: Auto-create reflections from alerts

## 📚 Complete Documentation

- [Full Grafana Setup Guide](./OTEL_GRAFANA_SETUP.md)
- [OTel Integration Plan](./OTEL_INTEGRATION_PLAN.md)
- [OTel Quick Start](./OTEL_QUICKSTART.md)

## 💰 Cost

**Self-Hosted**: $0 (100% free, runs locally)
**Cloud Alternative**: Grafana Cloud free tier available

---

**Ready to launch?** Run this now:

```bash
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh start-stack
```

Then open: http://localhost:3333 (admin/admin)
