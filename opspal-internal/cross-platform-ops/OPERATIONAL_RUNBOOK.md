# HubSpot Bulk Operations - Operational Runbook

## 🎯 Quick Reference

| Task | Command | Page |
|------|---------|------|
| Import contacts | `import-contacts file.csv --name "job"` | [→](#bulk-import) |
| Export contacts | `export-contacts ./out --props email,name` | [→](#bulk-export) |
| Check status | `hubspot-monitor` | [→](#monitoring) |
| Recover errors | `node scripts/recover-failed-import.js ID` | [→](#error-recovery) |
| Emergency stop | `docker-compose stop` | [→](#emergency-stop) |

## 📊 System Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   CLI/User  │────▶│ Bulk Toolkit │────▶│ HubSpot API │
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                    ┌───────▼────────┐
                    │  Rate Limiter  │
                    └────────────────┘
                            │
      ┌─────────────────────┼─────────────────────┐
      ▼                     ▼                     ▼
┌──────────┐        ┌──────────┐         ┌──────────┐
│ Job State│        │   Logs   │         │ Metrics  │
└──────────┘        └──────────┘         └──────────┘
```

## 🚦 Standard Operating Procedures

### Bulk Import

#### Pre-Import Checklist
```bash
# 1. Validate CSV format
head -10 import.csv
file import.csv  # Should be: UTF-8, with BOM optional

# 2. Check required columns
head -1 import.csv | tr ',' '\n'

# 3. Estimate processing time
wc -l import.csv  # ~10,000 rows/min

# 4. Check rate limits
hubspot-monitor --json | jq '.metrics.daily'

# 5. Verify disk space
df -h /app/data
```

#### Import Execution
```bash
# Standard import
import-contacts data/contacts.csv \
  --name "prod-$(date +%Y%m%d-%H%M)" \
  --mapping mappings/standard.json

# Large file (>1M rows)
import-contacts data/huge.csv \
  --name "large-import" \
  --chunk-size 500000

# With custom mapping
import-contacts data/custom.csv \
  --name "custom-import" \
  --mapping custom-map.json
```

#### Post-Import Verification
```bash
# Check completion
cat .jobs/hubspot/import-name.json | jq '.status'

# Review errors
ls -la out/*errors.csv

# Verify in HubSpot
curl -s "https://api.hubapi.com/crm/v3/objects/contacts?limit=1" \
  -H "Authorization: Bearer $TOKEN" | jq '.results[0]'
```

### Bulk Export

#### Export Planning
```bash
# Estimate size
curl -s "https://api.hubapi.com/crm/v3/objects/contacts/search" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filterGroups":[{}],"limit":0}' | jq '.total'

# Calculate time: ~50,000 rows/min
```

#### Export Execution
```bash
# Basic export
export-contacts ./exports \
  --name "weekly-backup"

# With filters
export-contacts ./exports \
  --filter filters/active-contacts.json \
  --props email,firstname,lastname,company

# With associations
export-contacts ./exports \
  --assoc company \
  --props email,company
```

### Monitoring

#### Real-time Dashboard
```bash
# Terminal dashboard
hubspot-monitor --follow

# Web dashboard
hubspot-monitor --web --port 3000
# Access at: http://localhost:3000

# JSON metrics
hubspot-monitor --json > metrics.json
```

#### Health Checks
```bash
# Quick health check
curl -f http://localhost:3000/health || echo "UNHEALTHY"

# Detailed status
docker-compose exec hubspot-bulk node -e "
  const h = require('./lib/hubspot-bulk');
  const client = new h();
  console.log(client.rateLimiter.getStatus());
"
```

### Error Recovery

#### Identify Failed Records
```bash
# List error files
ls -la out/*errors.csv | tail -5

# Analyze error types
cut -d',' -f2 out/import-123_errors.csv | sort | uniq -c

# View sample errors
head -20 out/import-123_errors.csv
```

#### Recovery Strategies

**Strategy 1: Auto-Recovery**
```bash
node scripts/recover-failed-import.js import-123 \
  --auto-retry \
  --output-dir ./recovery
```

**Strategy 2: Manual Fix & Retry**
```bash
# 1. Export failed rows
grep "INVALID_EMAIL" out/errors.csv > fix-emails.csv

# 2. Fix data manually
vim fix-emails.csv

# 3. Re-import
import-contacts fix-emails.csv --name "retry-emails"
```

**Strategy 3: Bulk Cleanup**
```bash
# For duplicate errors
node scripts/dedupe-and-retry.js out/errors.csv
```

## 🚨 Incident Response

### Severity Classification

| Severity | Criteria | Response Time | Example |
|----------|----------|---------------|---------|
| SEV-1 | Complete outage, data loss | 15 min | API down, credentials revoked |
| SEV-2 | >50% failure rate | 1 hour | Rate limiting, bulk errors |
| SEV-3 | <50% failure, degraded | 4 hours | Slow imports, partial failures |
| SEV-4 | Minor issues | 24 hours | UI issues, non-critical bugs |

### Common Incidents

#### 1. Rate Limit Exceeded
**Symptoms:** 429 errors, "Daily limit reached"

**Immediate Actions:**
```bash
# Stop all operations
docker-compose stop hubspot-worker

# Check current usage
hubspot-monitor --json | jq '.metrics.daily'

# Calculate reset time
node -e "
  const reset = new Date();
  reset.setUTCDate(reset.getUTCDate() + 1);
  reset.setUTCHours(0,0,0,0);
  console.log('Reset at:', reset);
"
```

**Resolution:**
```bash
# Reduce concurrency
export HS_MAX_CONCURRENT_IMPORTS=1

# Increase poll interval
export HS_POLL_INTERVAL_MS=30000

# Restart with throttling
docker-compose up -d
```

#### 2. Import Stuck
**Symptoms:** Import in PROCESSING > 2 hours

**Diagnosis:**
```bash
# Check import status
IMPORT_ID=xxx
curl -s "https://api.hubapi.com/crm/v3/imports/$IMPORT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.state'

# Check for errors
curl -s "https://api.hubapi.com/crm/v3/imports/$IMPORT_ID/errors" \
  -H "Authorization: Bearer $TOKEN" | jq '.numErrors'
```

**Resolution:**
```bash
# Option 1: Wait (imports can take hours)
echo "Large imports may take 4-8 hours"

# Option 2: Cancel and retry
curl -X POST "https://api.hubapi.com/crm/v3/imports/$IMPORT_ID/cancel" \
  -H "Authorization: Bearer $TOKEN"

# Split file and retry
split -l 500000 original.csv part_
for f in part_*; do
  import-contacts $f --name "split-$f"
done
```

#### 3. Memory Issues
**Symptoms:** Container OOMKilled, Node.js heap errors

**Immediate Fix:**
```bash
# Increase memory limit
docker-compose down
export NODE_OPTIONS="--max-old-space-size=4096"
docker-compose up -d

# Or edit docker-compose.yml
# resources:
#   limits:
#     memory: 4G
```

**Long-term Fix:**
```bash
# Reduce chunk sizes
export HS_CSV_CHUNK_MB=50
export HS_CSV_CHUNK_ROWS=100000
```

#### 4. Authentication Failure
**Symptoms:** 401 errors, "Invalid token"

**Verification:**
```bash
# Test token
curl -s "https://api.hubapi.com/account-info/v3/details" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" | jq '.portalId'
```

**Resolution:**
```bash
# Regenerate token in HubSpot
# https://app.hubspot.com/private-apps/{APP_ID}

# Update environment
export HUBSPOT_ACCESS_TOKEN="new-token"

# Restart services
docker-compose restart
```

### Emergency Stop

```bash
# Stop all containers
docker-compose stop

# Kill specific import
ps aux | grep import-contacts
kill -9 <PID>

# Clear job queue
rm -f .jobs/hubspot/*.json

# Disable auto-retry
export HS_AUTO_RETRY=false
```

## 📈 Performance Tuning

### Optimization Checklist

```bash
# 1. Measure baseline
time import-contacts test-10k.csv --name "baseline"

# 2. Tune concurrency
export HS_MAX_CONCURRENT_IMPORTS=5  # Test 1, 3, 5, 10

# 3. Adjust chunk size
export HS_CSV_CHUNK_ROWS=500000  # Test 100k, 250k, 500k, 1M

# 4. Optimize polling
export HS_POLL_INTERVAL_MS=10000  # Test 5s, 10s, 30s

# 5. Compare results
hubspot-monitor --json | jq '.operations[] | {
  id: .id,
  speed: .performance.rowsPerSecond,
  duration: .duration
}'
```

### Resource Monitoring

```bash
# CPU usage
docker stats hubspot-bulk --no-stream

# Memory usage
docker exec hubspot-bulk node -e "
  console.log(process.memoryUsage());
"

# Disk I/O
iostat -x 1 10 | grep sda

# Network throughput
iftop -i eth0
```

## 🔧 Maintenance Tasks

### Daily
```bash
# Morning health check
./scripts/daily-health-check.sh

# Clean old job files (>7 days)
find .jobs -name "*.json" -mtime +7 -delete

# Rotate logs
logrotate /etc/logrotate.d/hubspot-bulk
```

### Weekly
```bash
# Backup job states
tar -czf "jobs-backup-$(date +%Y%m%d).tar.gz" .jobs/

# Update toolkit
git pull origin main
npm ci
docker-compose build

# Performance report
node scripts/generate-weekly-report.js
```

### Monthly
```bash
# Full system audit
node scripts/system-audit.js

# Update dependencies
npm update
npm audit fix

# Archive old exports
find ./out -name "*.csv" -mtime +30 -exec gzip {} \;
```

## 📋 Checklists

### New Import Checklist
- [ ] CSV validated
- [ ] Required columns present
- [ ] Test with 100 rows first
- [ ] Rate limits checked
- [ ] Disk space adequate
- [ ] Monitoring started
- [ ] Recovery plan ready

### Production Deployment Checklist
- [ ] Tests passing
- [ ] Docker image built
- [ ] Environment variables set
- [ ] Volumes mounted
- [ ] Health checks working
- [ ] Monitoring configured
- [ ] Rollback plan ready

### Incident Response Checklist
- [ ] Issue identified
- [ ] Impact assessed
- [ ] Stakeholders notified
- [ ] Immediate mitigation applied
- [ ] Root cause identified
- [ ] Permanent fix deployed
- [ ] Post-mortem documented

## 📞 Escalation

| Level | Contact | When |
|-------|---------|------|
| L1 | On-call engineer | First response |
| L2 | Team lead | Complex issues |
| L3 | Platform team | Infrastructure |
| Vendor | HubSpot support | API issues |

---
Version: 1.0.0 | Updated: 2024-01-01