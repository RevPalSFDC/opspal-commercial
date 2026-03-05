# Port Configuration - OTel Monitoring Stack

## Port Assignments

| Service | Port | Purpose | URL |
|---------|------|---------|-----|
| **Grafana** | 3333 | Web UI for dashboards | http://localhost:3333 |
| **Prometheus** | 9090 | Metrics database & query UI | http://localhost:9090 |
| **OTel Collector (HTTP)** | 4318 | Receives telemetry via HTTP | http://localhost:4318 |
| **OTel Collector (gRPC)** | 4317 | Receives telemetry via gRPC | - |
| **OTel Prometheus Export** | 8889 | Exports metrics for Prometheus | http://localhost:8889/metrics |
| **OTel Internal Metrics** | 8888 | OTel Collector self-monitoring | http://localhost:8888/metrics |

## Why Port 3333 for Grafana?

**Port 3000 is commonly used by:**
- React development servers (`npm start`)
- Next.js development (`next dev`)
- Express.js apps
- Various Node.js tools

**Port 3333 avoids conflicts** and is rarely used by common dev tools.

## Changing Ports

### Change Grafana Port

Edit `.claude-plugins/developer-tools-plugin/docker/otel-stack.yml`:

```yaml
grafana:
  ports:
    - "YOUR_PORT:3000"  # Change YOUR_PORT (e.g., 3001, 4000)
  environment:
    - GF_SERVER_ROOT_URL=http://localhost:YOUR_PORT
```

### Change Prometheus Port

```yaml
prometheus:
  ports:
    - "YOUR_PORT:9090"  # Change YOUR_PORT (e.g., 9091, 9999)
```

### Change OTel Collector Ports

Edit `/home/chris/Desktop/RevPal/Agents/.otel/config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:YOUR_HTTP_PORT
      grpc:
        endpoint: 0.0.0.0:YOUR_GRPC_PORT

exporters:
  prometheus:
    endpoint: "0.0.0.0:YOUR_PROM_PORT"
```

Then update environment variable:
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:YOUR_HTTP_PORT"
```

## Port Conflicts

### Check if Port is in Use

```bash
# Check specific port
sudo lsof -i :3333
sudo lsof -i :9090
sudo lsof -i :4318

# Or with netstat
netstat -tuln | grep 3333
```

### Kill Process on Port

```bash
# Find process
sudo lsof -i :3333

# Kill it (use PID from above)
kill -9 <PID>
```

### Change Port (if conflict exists)

1. Stop the stack:
   ```bash
   bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh stop-stack
   ```

2. Edit `docker/otel-stack.yml` (change port)

3. Restart:
   ```bash
   bash .claude-plugins/developer-tools-plugin/scripts/lib/otel-grafana-setup.sh start-stack
   ```

## Firewall Configuration

If accessing from other machines:

```bash
# Allow Grafana (3333)
sudo ufw allow 3333/tcp

# Allow Prometheus (9090)
sudo ufw allow 9090/tcp

# OTel Collector ports (if accepting remote telemetry)
sudo ufw allow 4318/tcp  # HTTP
sudo ufw allow 4317/tcp  # gRPC
```

## Docker Host Networking

For non-Docker services to access the stack:

```yaml
# In docker-compose.yml
network_mode: "host"
```

This makes containers use the host's network directly (ports become accessible at localhost).

## Access URLs (Quick Reference)

```bash
# Grafana Dashboard
open http://localhost:3333

# Prometheus UI
open http://localhost:9090

# OTel Metrics (for debugging)
curl http://localhost:8889/metrics

# Check OTel Collector health
curl http://localhost:13133/  # Health check endpoint
```

## Environment Variables

```bash
# For Claude Code
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"

# For scripts accessing Grafana API
export GRAFANA_URL="http://localhost:3333"
export GRAFANA_USER="admin"
export GRAFANA_PASSWORD="admin"

# For scripts querying Prometheus
export PROMETHEUS_URL="http://localhost:9090"
```

## Production Considerations

### Security

1. **Change default passwords**:
   ```bash
   # In docker-compose.yml
   - GF_SECURITY_ADMIN_PASSWORD=your_secure_password
   ```

2. **Disable public access**:
   ```yaml
   ports:
     - "127.0.0.1:3333:3000"  # Only localhost
   ```

3. **Enable HTTPS** (use reverse proxy like nginx)

### Reverse Proxy (nginx)

```nginx
# Grafana
server {
    listen 443 ssl;
    server_name grafana.yourdomain.com;

    location / {
        proxy_pass http://localhost:3333;
        proxy_set_header Host $host;
    }
}

# Prometheus
server {
    listen 443 ssl;
    server_name prometheus.yourdomain.com;

    location / {
        proxy_pass http://localhost:9090;
        proxy_set_header Host $host;
    }
}
```

## Quick Port Check

```bash
# Check all monitoring stack ports
for port in 3333 9090 4318 4317 8889 8888; do
    if sudo lsof -i :$port > /dev/null 2>&1; then
        echo "✅ Port $port: IN USE"
    else
        echo "❌ Port $port: AVAILABLE"
    fi
done
```

---

**Default Access**: http://localhost:3333 (Grafana Dashboard)
