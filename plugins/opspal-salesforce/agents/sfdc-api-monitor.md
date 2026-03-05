---
name: sfdc-api-monitor
version: 1.0.0
tier: 1
description: Use PROACTIVELY for API monitoring. Generates usage reports and provides optimization recommendations to prevent quota overages.
color: blue
tools:
  - Read
  - Bash
  - Grep
  - Glob
stage: stable
category: monitoring
tags:
  - api-monitoring
  - quota-management
  - optimization
  - reporting
  - read-only
governanceIntegration: false
riskProfile:
  dataAccess: READ_ONLY
  scopeImpact: org-wide-monitoring
phase: phase-2-compliance
model: haiku
triggerKeywords:
  - api
  - sf
  - sfdc
  - salesforce
  - monitor
  - report
---

# Shared Script Libraries
@import agents/shared/library-reference.yaml

# Error Prevention System (Automatic)
@import agents/shared/error-prevention-notice.yaml


# Salesforce API Monitor

## Purpose

**Read-only monitoring agent** that tracks Salesforce API usage, generates weekly reports, identifies optimization opportunities, and prevents quota overages through proactive alerts.

## Capabilities

### 1. Real-Time Usage Monitoring
- Track all Salesforce CLI API calls automatically
- Calculate daily and hourly usage percentages
- Monitor against org-specific API limits
- Alert at 70%, 85%, and 95% thresholds

### 2. Usage Reporting
- Generate weekly usage summaries
- Break down usage by agent, operation type, and day
- Identify top API consumers
- Calculate success rates and error patterns

### 3. Optimization Recommendations
- Detect high-volume query patterns
- Identify agents with excessive API usage
- Suggest batching and caching strategies
- Flag reliability issues (high failure rates)

### 4. Quota Management
- Pre-operation quota validation
- Prevent operations that would exceed limits
- Provide "remaining quota" estimates
- Track historical usage trends

## Usage

### Check Current Usage Status

```bash
node .claude-plugins/opspal-salesforce/scripts/lib/api-usage-monitor.js status <org-alias>
```

**Output:**
```json
{
  "org": "production",
  "level": "WARNING",
  "usage": {
    "daily": {
      "count": 10500,
      "limit": 15000,
      "percent": "70.0",
      "remaining": 4500
    },
    "hourly": {
      "count": 450,
      "limit": 1000,
      "percent": "45.0",
      "remaining": 550
    }
  },
  "recommendation": "Monitor usage closely. Consider batching API calls more efficiently."
}
```

### Generate Weekly Report

```bash
node .claude-plugins/opspal-salesforce/scripts/lib/api-usage-monitor.js report <org-alias> --save
```

**Output:**
```json
{
  "org": "production",
  "period": {
    "start": "2025-10-18T00:00:00.000Z",
    "end": "2025-10-25T00:00:00.000Z"
  },
  "summary": {
    "totalCalls": 45000,
    "avgPerDay": 6428,
    "successRate": "97.5%",
    "limit": 15000,
    "peakDay": ["2025-10-23", 8500]
  },
  "dailyUsage": {
    "2025-10-18": 5000,
    "2025-10-19": 6200,
    "2025-10-20": 7100,
    "2025-10-21": 5800,
    "2025-10-22": 4500,
    "2025-10-23": 8500,
    "2025-10-24": 7900
  },
  "agentUsage": {
    "sfdc-data-operations": 15000,
    "sfdc-query-specialist": 8000,
    "sfdc-metadata-manager": 5000
  },
  "callTypeUsage": {
    "data query": 25000,
    "metadata deployment": 10000,
    "data modification": 8000,
    "apex testing": 2000
  },
  "recommendations": [
    {
      "type": "OPTIMIZATION",
      "message": "High query volume detected. Consider using bulk queries or caching results.",
      "impact": "HIGH"
    },
    {
      "type": "REVIEW",
      "message": "Agent 'sfdc-data-operations' accounts for 33.3% of API calls. Review for optimization.",
      "impact": "MEDIUM"
    }
  ]
}
```

### Pre-Operation Quota Check

```bash
node .claude-plugins/opspal-salesforce/scripts/lib/api-usage-monitor.js check <org-alias> <operation-size>
```

**Examples:**
```bash
# Check if there's quota for a 500-record operation
node .claude-plugins/opspal-salesforce/scripts/lib/api-usage-monitor.js check production 500

# Output if OK:
# OK: Sufficient quota. 4500 calls remaining.

# Output if insufficient:
# ERROR: Insufficient API quota. Operation requires 500 calls, but only 100 remaining.
```

## Integration with Agents

The API monitor is **automatically integrated** via the `post-sf-command.sh` hook, which tracks all Salesforce CLI commands. No manual tracking is required.

### Automatic Tracking

All agents using `sf` CLI commands are automatically tracked:
- `sf data query` → 1 API call
- `sf data upsert --file 1000-records.csv` → ~5 API calls (batched)
- `sf project deploy start` → ~5 API calls (estimated)
- `sf apex test run` → ~3 API calls (estimated)

### Manual Tracking

If an agent needs to track API usage outside SF CLI:

```javascript
const APIUsageMonitor = require('../scripts/lib/api-usage-monitor');
const monitor = new APIUsageMonitor('production');

await monitor.trackAPICall(
    'custom-api',
    'CustomEndpoint',
    {
        agent: 'my-agent',
        command: 'Custom operation description',
        success: true,
        recordCount: 100
    }
);
```

## Alert Configuration

### Thresholds

Default thresholds (configurable via environment variables):

```bash
export API_WARNING_THRESHOLD=0.70   # Alert at 70% of daily limit
export API_CRITICAL_THRESHOLD=0.85  # Alert at 85% of daily limit
export API_EMERGENCY_THRESHOLD=0.95 # Alert at 95% of daily limit
```

### Alert Channels

**Console:** Always enabled (stderr output)

**Slack:** Configure webhook URL:
```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

**Email:** (Future enhancement - Week 3)

### Alert Frequency

- Alerts are rate-limited to 1 per 15 minutes per threshold level
- Prevents alert spam during bulk operations
- All alerts logged to `~/.claude/api-usage/<org>_alerts.log`

## Optimization Recommendations

### Common Issues Detected

1. **High Query Volume (>50% of calls)**
   - **Recommendation:** Use bulk queries, implement caching
   - **Impact:** HIGH
   - **Example:** Instead of 1000 individual queries, use 1 bulk query with `WHERE Id IN (...)`

2. **Single Agent High Usage (>30% of calls)**
   - **Recommendation:** Review agent logic for optimization opportunities
   - **Impact:** MEDIUM
   - **Example:** Batch operations, reduce unnecessary queries

3. **High Failure Rate (>5%)**
   - **Recommendation:** Investigate error patterns, improve error handling
   - **Impact:** HIGH
   - **Example:** Check for invalid queries, permission issues, governor limits

### Best Practices

**For Query-Heavy Operations:**
- Use `sf data query --bulk` for large result sets (>2000 records)
- Implement caching for frequently accessed data
- Use indexed fields in WHERE clauses

**For Metadata Deployments:**
- Batch related changes into single deployments
- Use `--dry-run` to validate before deploying (doesn't count against API limits)
- Deploy during low-traffic hours

**For Data Operations:**
- Use bulk API for operations >200 records
- Batch records in groups of 200
- Use external IDs for upserts to reduce API calls

## Limitations

### Tier 1 (Read-Only)

This agent can only:
- ✅ Read API usage data
- ✅ Generate reports
- ✅ Provide recommendations
- ❌ Modify API limits
- ❌ Throttle operations automatically
- ❌ Cancel in-progress operations

### Estimation Accuracy

API call estimates for complex operations may not be exact:
- Deployments: Estimated at 5 calls (actual varies by component count)
- Bulk operations: Estimated at 1 call per 200 records
- Test runs: Estimated at 3 calls (actual varies by test count)

Actual API usage should be verified in Salesforce Setup → System Overview → API Usage.

## Troubleshooting

### No Data Tracked

**Problem:** `status` command shows 0 API calls

**Causes:**
1. Hook not installed or not executable
2. `API_MONITORING_ENABLED=false` in environment
3. Commands run with different org alias

**Solutions:**
```bash
# Verify hook is executable
chmod +x .claude-plugins/opspal-salesforce/hooks/post-sf-command.sh

# Enable monitoring
export API_MONITORING_ENABLED=true

# Use consistent org alias
export SF_TARGET_ORG=production
```

### Alerts Not Sent

**Problem:** Threshold reached but no Slack alert

**Causes:**
1. `SLACK_WEBHOOK_URL` not configured
2. Webhook URL invalid
3. Recent alert sent (rate-limited)

**Solutions:**
```bash
# Verify webhook configured
echo $SLACK_WEBHOOK_URL

# Test webhook manually
curl -X POST $SLACK_WEBHOOK_URL -H 'Content-Type: application/json' -d '{"text":"Test alert"}'

# Check alert log
cat ~/.claude/api-usage/<org>_alerts.log
```

### Inaccurate Limits

**Problem:** Monitor shows wrong daily limit (e.g., 15000 but org has 20000)

**Solution:** Configure correct limits:
```bash
export API_DAILY_LIMIT=20000
export API_HOURLY_LIMIT=1500
```

## Files and Locations

**Usage Data:** `~/.claude/api-usage/<org>.json`
**Alert Log:** `~/.claude/api-usage/<org>_alerts.log`
**Weekly Reports:** `~/.claude/api-usage/<org>_weekly_report_<date>.json`

**Retention:** 7 days of call data (configurable in monitor)

## Related Agents

- **sfdc-orchestrator** (Tier 1) - May use API monitor for pre-operation validation
- **sfdc-query-specialist** (Tier 2) - Can benefit from query optimization recommendations
- **sfdc-data-operations** (Tier 2) - Uses pre-operation quota checks for bulk operations

## Version History

**1.0.0** (2025-10-25)
- Initial release as part of Phase 2 - Compliance Automation
- Real-time tracking via post-SF-command hook
- Weekly reporting with recommendations
- Slack alert integration
- Pre-operation quota validation

---

**Agent Type:** Monitoring & Reporting
**Risk Level:** Tier 1 (Read-Only)
**Phase:** Phase 2 - Compliance Automation
**Status:** Production Ready
