# HubSpot Bulk Toolkit - Production Deployment Guide

## 🚀 Production Readiness Checklist

### Pre-Deployment
- [ ] HubSpot API credentials configured
- [ ] Rate limits reviewed and configured
- [ ] Monitoring infrastructure ready
- [ ] Backup and recovery plan documented
- [ ] Security audit completed
- [ ] Load testing performed

## 📋 Deployment Options

### Option 1: Docker Deployment (Recommended)

```bash
# 1. Build production image
docker build -t hubspot-bulk:prod .

# 2. Configure environment
cp .env.template .env.production
vim .env.production  # Add credentials

# 3. Deploy with Docker Compose
docker-compose -f docker-compose.yml up -d

# 4. Verify deployment
docker-compose ps
docker-compose logs -f hubspot-monitor
```

### Option 2: Kubernetes Deployment

```yaml
# hubspot-bulk-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hubspot-bulk-processor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: hubspot-bulk
  template:
    metadata:
      labels:
        app: hubspot-bulk
    spec:
      containers:
      - name: processor
        image: hubspot-bulk:prod
        env:
        - name: HUBSPOT_ACCESS_TOKEN
          valueFrom:
            secretKeyRef:
              name: hubspot-secrets
              key: access-token
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        volumeMounts:
        - name: data
          mountPath: /app/data
        - name: jobs
          mountPath: /app/.jobs
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: hubspot-data-pvc
      - name: jobs
        persistentVolumeClaim:
          claimName: hubspot-jobs-pvc
```

### Option 3: Direct Node.js Deployment

```bash
# 1. Install dependencies
npm ci --only=production

# 2. Configure systemd service
sudo cp hubspot-bulk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hubspot-bulk
sudo systemctl start hubspot-bulk

# 3. Verify service
sudo systemctl status hubspot-bulk
sudo journalctl -u hubspot-bulk -f
```

## 🔐 Security Configuration

### 1. API Credentials

```bash
# Use environment variables (never commit)
export HUBSPOT_ACCESS_TOKEN="pat-na1-xxxxx"
export HUBSPOT_PRIVATE_APP_KEY="xxxxx"

# Or use secrets manager
aws secretsmanager get-secret-value --secret-id hubspot-credentials
```

### 2. Network Security

```nginx
# Nginx reverse proxy config
server {
    listen 443 ssl;
    server_name bulk-api.yourdomain.com;

    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location /monitor {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Real-IP $remote_addr;
        auth_basic "Restricted";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }
}
```

### 3. Rate Limit Configuration

```javascript
// Production rate limits
{
  "rateLimit": {
    "burst": {
      "requestsPerSecond": 8,      // Conservative
      "requestsPer10Seconds": 80   // 80% of limit
    },
    "daily": {
      "requestsPerDay": 400000     // 80% of 500k limit
    }
  }
}
```

## 📊 Monitoring Setup

### 1. Application Monitoring

```bash
# Start monitor dashboard
hubspot-monitor --follow --port 3000

# Export metrics to Prometheus
hubspot-monitor --json --output /metrics/hubspot.json
```

### 2. CloudWatch Integration

```javascript
// cloudwatch-metrics.js
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();
const { getMonitor } = require('./lib/hubspot-bulk/monitoring');

setInterval(async () => {
    const monitor = getMonitor();
    const metrics = monitor.exportMetrics();

    await cloudwatch.putMetricData({
        Namespace: 'HubSpot/Bulk',
        MetricData: [
            {
                MetricName: 'TotalRows',
                Value: metrics.metrics.totalRows,
                Timestamp: new Date()
            },
            {
                MetricName: 'FailedRows',
                Value: metrics.metrics.failedRows,
                Timestamp: new Date()
            },
            {
                MetricName: 'SuccessRate',
                Value: metrics.summary.successRate,
                Unit: 'Percent',
                Timestamp: new Date()
            }
        ]
    }).promise();
}, 60000); // Every minute
```

### 3. Alerting Rules

```yaml
# Prometheus alerts
groups:
- name: hubspot_bulk
  rules:
  - alert: HighErrorRate
    expr: hubspot_error_rate > 0.05
    for: 5m
    annotations:
      summary: "High error rate: {{ $value }}%"

  - alert: RateLimitApproaching
    expr: hubspot_daily_requests > 450000
    annotations:
      summary: "Approaching daily limit: {{ $value }}"

  - alert: ImportStuck
    expr: hubspot_import_duration > 7200
    annotations:
      summary: "Import running > 2 hours"
```

## 🔄 Operational Procedures

### Daily Operations

```bash
# Morning checks
./scripts/daily-health-check.sh

# Check job queue
ls -la .jobs/hubspot/*.json | wc -l

# Review overnight errors
grep ERROR logs/hubspot/*.log | tail -100

# Clean completed jobs (> 7 days old)
find .jobs/hubspot -name "*.json" -mtime +7 -delete
```

### Bulk Import Process

```bash
# 1. Pre-flight validation
node scripts/validate-csv.js data/import.csv

# 2. Start import with monitoring
import-contacts data/import.csv \
  --name "prod-$(date +%Y%m%d)" &

# 3. Monitor progress
hubspot-monitor --follow

# 4. Handle errors if any
node scripts/recover-failed-import.js import-xxx
```

### Emergency Procedures

```bash
# Stop all operations
docker-compose stop

# Cancel stuck import
curl -X POST https://api.hubapi.com/crm/v3/imports/${IMPORT_ID}/cancel \
  -H "Authorization: Bearer ${TOKEN}"

# Reset rate limiter
redis-cli DEL hubspot:rate:*

# Rollback deployment
kubectl rollout undo deployment/hubspot-bulk-processor
```

## 📈 Performance Tuning

### Optimal Configuration

```javascript
// For 2M+ record operations
{
  "imports": {
    "maxRowsPerFile": 5000000,    // 5M chunks
    "maxConcurrent": 3,            // Parallel imports
    "pollIntervalMs": 10000        // 10 sec polling
  },
  "csv": {
    "chunkSizeMB": 100,           // 100MB chunks
    "maxRowsPerChunk": 250000     // 250k rows
  }
}
```

### Resource Requirements

| Workload | CPU | Memory | Storage | Network |
|----------|-----|--------|---------|---------|
| < 100k records | 1 core | 512MB | 10GB | 10Mbps |
| 100k - 1M | 2 cores | 1GB | 50GB | 50Mbps |
| 1M - 10M | 4 cores | 2GB | 200GB | 100Mbps |
| > 10M | 8 cores | 4GB | 500GB | 1Gbps |

## 🔍 Troubleshooting

### Common Issues

**1. Rate Limit Errors**
```bash
# Check current usage
hubspot-monitor --json | jq '.metrics.daily'

# Reduce concurrency
export HS_MAX_CONCURRENT_IMPORTS=1
```

**2. Memory Issues**
```bash
# Increase Node.js heap
export NODE_OPTIONS="--max-old-space-size=4096"

# Monitor memory usage
docker stats hubspot-bulk
```

**3. Import Timeouts**
```bash
# Increase timeout
export HS_MAX_POLL_DURATION_MS=14400000  # 4 hours

# Check import status manually
curl https://api.hubapi.com/crm/v3/imports/${ID} \
  -H "Authorization: Bearer ${TOKEN}"
```

### Debug Mode

```bash
# Enable verbose logging
export HS_LOG_LEVEL=debug
export NODE_ENV=development

# Trace API calls
export DEBUG=hubspot:*

# Dry run mode
import-contacts data.csv --dry-run
```

## 📝 Compliance & Auditing

### GDPR Compliance

```bash
# Enable PII redaction
export HS_REDACT_PII=true

# Auto-delete temp files
export HS_DELETE_TEMP=true

# Audit log location
tail -f logs/audit/hubspot-bulk-$(date +%Y%m%d).log
```

### Audit Trail

```javascript
// Every operation logged with:
{
  "timestamp": "2024-01-01T12:00:00Z",
  "operation": "import",
  "user": "system",
  "jobId": "import-123",
  "records": 10000,
  "status": "success",
  "duration": 120,
  "ipAddress": "10.0.0.1"
}
```

## 🚨 Incident Response

### Severity Levels

| Level | Response Time | Examples |
|-------|--------------|----------|
| P1 - Critical | 15 min | Complete outage, data loss |
| P2 - High | 1 hour | >50% failure rate |
| P3 - Medium | 4 hours | <50% failure rate |
| P4 - Low | 24 hours | Minor issues |

### Escalation Path

1. **L1 Support**: Monitor alerts, basic troubleshooting
2. **L2 DevOps**: Infrastructure issues, deployment
3. **L3 Engineering**: Code fixes, API issues
4. **Vendor Support**: HubSpot API team

## 📚 Documentation

- [API Reference](./lib/hubspot-bulk/README.md)
- [Runbook](./OPERATIONAL_RUNBOOK.md)
- [Architecture](./ARCHITECTURE.md)
- [Disaster Recovery](./DISASTER_RECOVERY.md)

## 📞 Support Contacts

- **On-Call**: PagerDuty `hubspot-bulk` service
- **Slack**: #hubspot-operations
- **Email**: bulk-operations@company.com
- **HubSpot Support**: support@hubspot.com

---
Last Updated: 2024-01-01
Version: 1.0.0