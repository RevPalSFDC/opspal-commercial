# Grafana Dashboard Setup for Claude Code Metrics

Build the dashboard from the Reddit post: https://www.reddit.com/r/ClaudeCode/comments/1pjon1r/til_that_claude_code_has_opentelemetry_metrics/

## Architecture

```
Claude Code → OTel Collector → Prometheus → Grafana
```

## Quick Setup (Docker - Recommended)

### Option 1: Docker Compose (Easiest - 5 minutes)

```bash
cd /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins

# Start Prometheus + Grafana
docker-compose -f .claude-plugins/developer-tools-plugin/docker/otel-stack.yml up -d

# View logs
docker-compose -f .claude-plugins/developer-tools-plugin/docker/otel-stack.yml logs -f
```

**Access**:
- Grafana: http://localhost:3333 (admin/admin)
- Prometheus: http://localhost:9090

### Option 2: Manual Setup (20 minutes)

## Step 1: Update OTel Collector Config

Add Prometheus exporter to the collector:

```bash
# Backup current config
cp /home/chris/Desktop/RevPal/Agents/.otel/config.yaml /home/chris/Desktop/RevPal/Agents/.otel/config.yaml.backup

# The setup script will do this for you, or edit manually
```

**Updated config** (already includes file export):

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

processors:
  batch:
    timeout: 10s
    send_batch_size: 100

  attributes:
    actions:
      - key: service.name
        value: revpal-agent-system
        action: insert

exporters:
  # Console logging (debugging)
  logging:
    verbosity: detailed

  # File export (for scripts)
  file:
    path: /home/chris/Desktop/RevPal/Agents/.otel/metrics.json

  # Prometheus export (for Grafana)
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: claude_code

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [logging, file, prometheus]

    traces:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [logging, file]
```

## Step 2: Install Prometheus

### Using Docker (Recommended)

```bash
# Create prometheus config
mkdir -p ~/.otel/prometheus

cat > ~/.otel/prometheus/prometheus.yml <<EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'otel-collector'
    static_configs:
      - targets: ['host.docker.internal:8889']

  - job_name: 'claude-code'
    static_configs:
      - targets: ['host.docker.internal:8889']

    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: 'claude-code'
EOF

# Start Prometheus
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v ~/.otel/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml \
  --add-host=host.docker.internal:host-gateway \
  prom/prometheus
```

### Using Native Install (Ubuntu/Debian)

```bash
# Download Prometheus
cd /tmp
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xzf prometheus-2.45.0.linux-amd64.tar.gz
sudo mv prometheus-2.45.0.linux-amd64 /opt/prometheus

# Create config
sudo mkdir -p /etc/prometheus
sudo cat > /etc/prometheus/prometheus.yml <<EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'claude-code'
    static_configs:
      - targets: ['localhost:8889']
EOF

# Create systemd service
sudo cat > /etc/systemd/system/prometheus.service <<EOF
[Unit]
Description=Prometheus
After=network.target

[Service]
Type=simple
User=prometheus
ExecStart=/opt/prometheus/prometheus --config.file=/etc/prometheus/prometheus.yml --storage.tsdb.path=/var/lib/prometheus
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo useradd --no-create-home --shell /bin/false prometheus
sudo mkdir -p /var/lib/prometheus
sudo chown prometheus:prometheus /var/lib/prometheus
sudo systemctl daemon-reload
sudo systemctl start prometheus
sudo systemctl enable prometheus
```

## Step 3: Install Grafana

### Using Docker (Recommended)

```bash
# Start Grafana
docker run -d \
  --name grafana \
  -p 3000:3000 \
  -e "GF_SECURITY_ADMIN_PASSWORD=admin" \
  -e "GF_USERS_ALLOW_SIGN_UP=false" \
  --add-host=host.docker.internal:host-gateway \
  grafana/grafana
```

### Using Native Install (Ubuntu/Debian)

```bash
# Add Grafana repository
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install grafana

# Start service
sudo systemctl start grafana-server
sudo systemctl enable grafana-server
```

## Step 4: Configure Grafana

1. **Open Grafana**: http://localhost:3333
2. **Login**: admin/admin (change password when prompted)
3. **Add Prometheus Data Source**:
   - Click "Configuration" → "Data Sources" → "Add data source"
   - Select "Prometheus"
   - URL: `http://host.docker.internal:9090` (Docker) or `http://localhost:9090` (native)
   - Click "Save & Test"

## Step 5: Import Dashboard

### Method 1: Import Pre-built Dashboard

1. In Grafana, click "+" → "Import"
2. Upload the dashboard JSON file:
   ```bash
   .claude-plugins/developer-tools-plugin/grafana/claude-code-dashboard.json
   ```
3. Select the Prometheus data source
4. Click "Import"

### Method 2: Manual Dashboard Creation

See the dashboard JSON file for the complete configuration, or use the Dashboard Builder script:

```bash
node .claude-plugins/developer-tools-plugin/scripts/lib/grafana-dashboard-builder.js
```

## Dashboard Panels

The dashboard includes:

### 1. Agent Performance
- **Total Invocations** (counter)
- **Average Duration** (gauge)
- **Success Rate** (gauge)
- **Invocations Over Time** (graph)
- **Duration by Agent** (bar chart)

### 2. Cost Analysis
- **Total Token Usage** (counter)
- **Estimated Cost** (gauge)
- **Tokens by Plugin** (pie chart)
- **Token Usage Over Time** (graph)
- **Cost Trend** (graph)

### 3. Quality Metrics
- **Error Rate** (gauge)
- **Errors by Type** (pie chart)
- **Error Rate Over Time** (graph)
- **Top Failing Agents** (table)

### 4. Workflow Analytics
- **Active Workflows** (counter)
- **Average Workflow Duration** (gauge)
- **Workflow Chains** (sankey diagram)
- **Complexity Distribution** (histogram)

## Sample PromQL Queries

Here are the key queries used in the dashboard:

### Agent Invocations
```promql
# Total invocations
sum(claude_code_agent_invocations_total)

# Invocations by agent
sum by (agent_type) (claude_code_agent_invocations_total)

# Rate per minute
rate(claude_code_agent_invocations_total[5m])
```

### Duration Metrics
```promql
# Average duration (all agents)
avg(claude_code_agent_duration_ms)

# P95 duration by agent
histogram_quantile(0.95, sum by (agent_type, le) (claude_code_agent_duration_bucket))

# Duration over time
rate(claude_code_agent_duration_ms_sum[5m]) / rate(claude_code_agent_duration_ms_count[5m])
```

### Token Usage
```promql
# Total tokens
sum(claude_code_agent_tokens_total)

# Tokens by plugin
sum by (plugin_name) (claude_code_agent_tokens_total)

# Token rate
rate(claude_code_agent_tokens_total[5m])
```

### Error Rates
```promql
# Overall error rate
sum(rate(claude_code_agent_errors_total[5m])) / sum(rate(claude_code_agent_invocations_total[5m]))

# Error rate by agent
sum by (agent_type) (rate(claude_code_agent_errors_total[5m])) / sum by (agent_type) (rate(claude_code_agent_invocations_total[5m]))

# Errors by type
sum by (error_type) (claude_code_agent_errors_total)
```

## Restart OTel Collector with New Config

```bash
# Update the config (use the setup helper)
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh enable-prometheus

# Restart collector
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-quickstart.sh restart

# Verify Prometheus endpoint
curl http://localhost:8889/metrics
```

## Verify Setup

```bash
# 1. Check OTel Collector is exporting to Prometheus
curl http://localhost:8889/metrics | grep claude_code

# 2. Check Prometheus is scraping
# Open: http://localhost:9090/targets
# Should show "otel-collector" target as UP

# 3. Test PromQL query in Prometheus UI
# Open: http://localhost:9090/graph
# Query: claude_code_agent_invocations_total

# 4. Check Grafana connection
# Open: http://localhost:3333
# Go to Data Sources → Prometheus → "Save & Test"
```

## Troubleshooting

### OTel Collector not exporting
```bash
# Check if Prometheus exporter is running
curl http://localhost:8889/metrics

# Check collector logs
tail -f /home/chris/Desktop/RevPal/Agents/.otel/collector.log

# Restart collector
bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-quickstart.sh restart
```

### Prometheus not scraping
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq

# View Prometheus logs
docker logs prometheus  # Docker
sudo journalctl -u prometheus -f  # Native
```

### Grafana not showing data
```bash
# Test data source in Grafana UI
# Configuration → Data Sources → Prometheus → "Save & Test"

# Check if metrics exist in Prometheus
curl http://localhost:9090/api/v1/query?query=up
```

### No metrics appearing
- Ensure Claude Code is running with OTEL_EXPORTER_OTLP_ENDPOINT set
- Wait a few minutes for metrics to start flowing
- Check if OTel Collector is receiving data: `tail -f .otel/collector.log`

## Alerting (Optional)

Add Grafana alerts for critical thresholds:

### High Error Rate Alert
```yaml
Alert: Claude Code High Error Rate
Condition: Error rate > 15%
Query: sum(rate(claude_code_agent_errors_total[5m])) / sum(rate(claude_code_agent_invocations_total[5m])) > 0.15
Action: Send to Slack webhook
```

### Slow Agent Alert
```yaml
Alert: Claude Code Slow Agent
Condition: P95 duration > 30s
Query: histogram_quantile(0.95, sum by (agent_type, le) (rate(claude_code_agent_duration_bucket[5m]))) > 30000
Action: Send to Slack webhook
```

### High Token Usage Alert
```yaml
Alert: Claude Code High Token Usage
Condition: Token rate > 10k/min
Query: rate(claude_code_agent_tokens_total[1m]) > 10000
Action: Send to Slack webhook
```

## Next Steps

1. **Customize Dashboard**: Add panels for your specific needs
2. **Set Up Alerts**: Configure alerting for critical metrics
3. **Add Variables**: Create dashboard variables for filtering by agent/plugin
4. **Share Dashboard**: Export and share with team
5. **Integrate with Reflection System**: Auto-create reflections from alerts

## Resources

- Grafana Docs: https://grafana.com/docs/
- Prometheus Docs: https://prometheus.io/docs/
- OTel Collector Docs: https://opentelemetry.io/docs/collector/
- Reddit Thread: https://www.reddit.com/r/ClaudeCode/comments/1pjon1r/

## Cost

**Docker Setup**: Free (runs locally)
**Native Setup**: Free (open source)
**Cloud Option**: Grafana Cloud starts at $0 (free tier) or $50/mo

**Total Cost**: $0 for self-hosted setup
