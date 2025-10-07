# Salesloft Sync Emergency Response Runbook

## 🚨 EMERGENCY QUICK REFERENCE

### Critical Issues & Immediate Actions

| Issue | Severity | First Action | Time to Resolution |
|-------|----------|--------------|-------------------|
| **Complete CRM Disconnection** | 🔴 CRITICAL | Reconnect immediately via Settings → CRM | 15 minutes |
| **Wrong Instance Connection** | 🔴 CRITICAL | Disconnect and reconnect to correct instance | 10 minutes |
| **100% Sync Failures** | 🔴 CRITICAL | Check connection status first | 30 minutes |
| **Mass Data Loss** | 🔴 CRITICAL | Stop all syncs, backup data | 1-2 hours |
| **Rate Limit Lockout** | 🟠 HIGH | Pause syncs for cooldown period | 1 hour |
| **User Mapping Lost** | 🟠 HIGH | Run user mapping script | 30 minutes |
| **Duplicate Storm** | 🟡 MEDIUM | Run deduplication toolkit | 1 hour |
| **Field Mapping Errors** | 🟡 MEDIUM | Review and fix mappings | 45 minutes |

### Emergency Command Center

```bash
# Check system status
python3 salesloft-sync-health-monitor.py --mode once

# Validate configuration
python3 salesloft-integration-validator.py

# Quick recovery attempt
python3 salesloft-sync-recovery-toolkit.py --action retry --hours 1 --dry-run

# Monitor continuously
python3 salesloft-sync-health-monitor.py --mode continuous --interval 60
```

---

## 📋 Response Procedures

### PROCEDURE 1: Complete CRM Disconnection

**Symptoms:**
- Error: "Not connected to your CRM"
- All activities fail to sync
- Users show no CRM connection

**Immediate Response (0-5 minutes):**

1. **Verify the issue**
   ```bash
   curl -H "Authorization: Bearer $SALESLOFT_TOKEN" \
     https://api.salesloft.com/v2/team | jq '.data.crm_connected'
   ```

2. **Check for widespread impact**
   - Are all users affected? → System-wide issue
   - Only some users? → User-specific issue

3. **Capture error logs**
   ```bash
   python3 scripts/analyze_sync_errors.py > /tmp/sync_errors_$(date +%Y%m%d).log
   ```

**Resolution Steps (5-15 minutes):**

1. **Access Salesloft Admin Panel**
   - URL: https://app.salesloft.com/app/settings/integrations
   - Login with admin credentials

2. **Reconnect to Salesforce**
   ```
   Settings → Integrations → Salesforce
   Click "Disconnect" (if shown as connected)
   Click "Connect to Salesforce"
   Use: https://rentable.my.salesforce.com
   Complete OAuth flow
   ```

3. **Verify Connection**
   ```bash
   python3 salesloft-integration-validator.py --verbose
   ```

4. **Trigger Retroactive Sync**
   ```bash
   python3 salesloft-sync-recovery-toolkit.py --action retry --hours 24
   ```

**Post-Resolution:**
- Monitor for 30 minutes
- Check sync success rate
- Document root cause

---

### PROCEDURE 2: Wrong Salesforce Instance

**Symptoms:**
- Connected to na34 instead of na14
- "Unable to find record" errors
- Records exist but appear deleted

**Immediate Response (0-3 minutes):**

1. **Confirm instance mismatch**
   ```bash
   # Check current connection
   curl -H "Authorization: Bearer $SALESLOFT_TOKEN" \
     https://api.salesloft.com/v2/team | jq '.data.crm_url'
   ```

2. **Stop all active syncs**
   - Notify team: "STOP all Salesloft activities immediately"
   - Pause any automation

**Resolution Steps (3-10 minutes):**

1. **Disconnect Wrong Instance**
   ```
   Salesloft Settings → CRM → Salesforce
   Verify URL shows wrong instance (e.g., na34)
   Click "Disconnect"
   ```

2. **Connect to Correct Instance**
   ```
   Click "Connect to Salesforce"
   CRITICAL: Use exact URL: https://rentable.my.salesforce.com
   Do NOT use: login.salesforce.com
   Complete OAuth
   ```

3. **Verify Correct Connection**
   ```bash
   python3 salesloft-integration-validator.py | grep "Instance Configuration"
   ```

4. **Remap All Users**
   ```bash
   python3 salesloft-sync-recovery-toolkit.py --action mappings
   ```

**Post-Resolution:**
- Re-sync failed records from past 48 hours
- Verify sample records sync correctly
- Update documentation with correct instance URL

---

### PROCEDURE 3: Mass Sync Failures (>90%)

**Symptoms:**
- Sync success rate below 10%
- Multiple error types occurring
- System appears functional but nothing syncs

**Immediate Response (0-5 minutes):**

1. **Categorize errors**
   ```bash
   python3 scripts/analyze_sync_errors.py --export errors.json
   cat errors.json | jq '.error_distribution'
   ```

2. **Check API limits**
   ```bash
   # Salesforce limits
   sf limits api display --target-org production

   # Salesloft limits
   curl -I -H "Authorization: Bearer $SALESLOFT_TOKEN" \
     https://api.salesloft.com/v2/me | grep X-RateLimit
   ```

3. **Identify pattern**
   - Time-based? → Scheduled job conflict
   - User-based? → Permission issue
   - Object-based? → Field mapping problem

**Resolution Steps (5-30 minutes):**

Based on error pattern:

**A. Permission Errors:**
```bash
# Check Salesforce permissions
sf user display --target-org production

# Verify API access
sf data query --query "SELECT Id FROM User LIMIT 1" --target-org production
```

**B. Field Mapping Errors:**
```bash
# Validate mappings
python3 salesloft-integration-validator.py --verbose | grep "Field Mapping"

# Fix in Salesloft:
Settings → CRM → Field Configuration
Review each object's mappings
Ensure required fields are mapped
```

**C. Rate Limiting:**
```bash
# Reduce sync frequency
Settings → CRM → Sync Settings
Change real-time to 5-minute intervals
Reduce batch sizes to 50
```

**Post-Resolution:**
```bash
# Retry failed syncs
python3 salesloft-sync-recovery-toolkit.py --action retry --hours 6

# Monitor recovery
python3 salesloft-sync-health-monitor.py --mode continuous --interval 60
```

---

### PROCEDURE 4: User Mapping Crisis

**Symptoms:**
- Activities not attributed to correct users
- "Owner not found" errors
- All activities assigned to integration user

**Immediate Response (0-5 minutes):**

1. **Check unmapped users**
   ```bash
   curl -H "Authorization: Bearer $SALESLOFT_TOKEN" \
     https://api.salesloft.com/v2/users | \
     jq '.data[] | select(.active==true and .crm_user_id==null) | .name'
   ```

2. **Export user list**
   ```bash
   # Salesloft users
   curl -H "Authorization: Bearer $SALESLOFT_TOKEN" \
     https://api.salesloft.com/v2/users > sl_users.json

   # Salesforce users
   sf data query --query "SELECT Id, Name, Email FROM User WHERE IsActive=true" \
     --target-org production --result-format json > sf_users.json
   ```

**Resolution Steps (5-30 minutes):**

**Automated Fix:**
```bash
# Run mapping tool
python3 salesloft-sync-recovery-toolkit.py --action mappings
```

**Manual Fix (if automated fails):**
1. Access Salesloft Settings → Users
2. For each user:
   - Click Edit
   - Select matching Salesforce user
   - Save

3. Priority order:
   - Sales managers first
   - Active sales reps
   - Support team
   - Admin users

**Post-Resolution:**
- Verify all users show CRM IDs
- Test activity creation
- Re-sync recent activities

---

## 🔄 Recovery Workflows

### Workflow A: Complete System Recovery

Use when multiple systems are failing or after major incident.

```bash
#!/bin/bash
# Full system recovery script

echo "Starting full system recovery..."

# Step 1: Validate configuration
echo "[1/5] Validating configuration..."
python3 salesloft-integration-validator.py --verbose

# Step 2: Fix mappings
echo "[2/5] Fixing mappings..."
python3 salesloft-sync-recovery-toolkit.py --action mappings

# Step 3: Clean duplicates
echo "[3/5] Cleaning duplicates..."
python3 salesloft-sync-recovery-toolkit.py --action duplicates --dry-run

# Step 4: Retry failed syncs
echo "[4/5] Retrying failed syncs..."
python3 salesloft-sync-recovery-toolkit.py --action retry --hours 48

# Step 5: Monitor
echo "[5/5] Starting monitor..."
python3 salesloft-sync-health-monitor.py --mode continuous --interval 300
```

### Workflow B: Data Recovery

Use when data is missing or lost.

```bash
#!/bin/bash
# Data recovery script

# Define date range
START_DATE="2025-09-01"
END_DATE="2025-09-23"

echo "Recovering data from $START_DATE to $END_DATE"

# Step 1: Identify missing data
python3 salesloft-sync-recovery-toolkit.py \
  --action recover \
  --start-date $START_DATE \
  --end-date $END_DATE \
  --dry-run

# Step 2: Confirm and recover
read -p "Proceed with recovery? (y/n) " -n 1 -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python3 salesloft-sync-recovery-toolkit.py \
      --action recover \
      --start-date $START_DATE \
      --end-date $END_DATE
fi
```

---

## 📊 Monitoring & Alerting Setup

### Continuous Monitoring Setup

1. **Create monitoring service**
```bash
# Create systemd service (Linux)
sudo cat > /etc/systemd/system/salesloft-monitor.service << EOF
[Unit]
Description=Salesloft Sync Monitor
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/Desktop/RevPal/Agents
ExecStart=/usr/bin/python3 scripts/salesloft-sync-health-monitor.py --mode continuous
Restart=always
Environment="SALESLOFT_TOKEN=$SALESLOFT_TOKEN"
Environment="SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable salesloft-monitor
sudo systemctl start salesloft-monitor
```

2. **Configure alerts**
```bash
# Set environment variables
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
export ALERT_EMAIL="ops-team@company.com"
export ALERT_THRESHOLD_ERROR_RATE=5
export ALERT_THRESHOLD_SYNC_DELAY=3600
```

### Alert Response Matrix

| Alert Type | Response Time | Escalation | Action |
|------------|---------------|------------|--------|
| Connection Lost | Immediate | Ops Manager | Run PROCEDURE 1 |
| Wrong Instance | Immediate | Ops Manager | Run PROCEDURE 2 |
| High Error Rate (>20%) | 15 minutes | Team Lead | Investigate pattern |
| User Unmapped | 30 minutes | Admin | Run mapping fix |
| Sync Delays (>1hr) | 1 hour | On-call | Check performance |
| Duplicates Found | 4 hours | Admin | Schedule cleanup |

---

## 🛠️ Troubleshooting Guide

### Common Issues & Solutions

#### Issue: "OAuth token expired"
```bash
# Solution: Reconnect
Salesloft Settings → CRM → Salesforce → Reconnect
```

#### Issue: "Field not accessible"
```bash
# Check field permissions
sf field permissions display --sobject Contact --field Email

# Grant access if needed
sf user permset assign --permset-name Sales_User --target-org production
```

#### Issue: "Rate limit exceeded"
```bash
# Check current usage
curl -I -H "Authorization: Bearer $SALESLOFT_TOKEN" \
  https://api.salesloft.com/v2/me | grep X-RateLimit

# Reduce load
- Decrease batch sizes
- Increase sync intervals
- Pause non-critical syncs
```

#### Issue: "Timeout errors"
```bash
# Optimize sync settings
- Reduce batch size to 50
- Increase timeout to 60 seconds
- Use off-peak hours for bulk syncs
```

---

## 📞 Escalation Contacts

### Internal Team

| Role | Name | Contact | When to Call |
|------|------|---------|--------------|
| Salesloft Admin | Chris Acevedo | cacevedo@company.com | First contact for all issues |
| Salesforce Admin | [Name] | [Email] | Permission/access issues |
| DevOps Lead | [Name] | [Email] | Infrastructure issues |
| Sales Ops Manager | [Name] | [Email] | Business impact decisions |

### Vendor Support

| Vendor | Contact | Priority | Use For |
|--------|---------|----------|---------|
| Salesloft Support | support@salesloft.com | P1 for outages | Platform issues |
| Salesforce Support | [Case Portal] | P2 for sync | API/permission issues |
| Integration Partner | [Contact] | P3 | Custom integration help |

### Escalation Timeline

```
0-15 min:  Internal admin attempts fix
15-30 min: Engage team lead if unresolved
30-60 min: Open vendor ticket if needed
60+ min:   Executive escalation for business impact
```

---

## 📝 Post-Incident Procedures

### Required Documentation

After resolving any incident:

1. **Incident Report Template**
```markdown
# Incident Report: [Date]

## Summary
- Start time:
- Resolution time:
- Impact:
- Root cause:

## Timeline
- [Time]: Issue detected
- [Time]: Investigation started
- [Time]: Root cause identified
- [Time]: Fix implemented
- [Time]: Resolution verified

## Lessons Learned
- What went well:
- What could improve:
- Action items:
```

2. **Update runbook with new findings**
3. **Schedule post-mortem if severity was HIGH or CRITICAL**
4. **Update monitoring to catch similar issues**

---

## 🔧 Maintenance Windows

### Scheduled Maintenance

**Weekly:** Sundays 2-4 AM ET
- Duplicate cleanup
- User mapping verification
- Field mapping review

**Monthly:** First Sunday 1-5 AM ET
- Full system validation
- Historical data recovery
- Performance optimization

### Maintenance Commands

```bash
# Pre-maintenance backup
python3 scripts/backup_salesloft_config.py

# Maintenance mode
python3 scripts/set_maintenance_mode.py --enable

# Run maintenance
./maintenance/weekly_cleanup.sh

# Post-maintenance validation
python3 salesloft-integration-validator.py

# Exit maintenance mode
python3 scripts/set_maintenance_mode.py --disable
```

---

## ✅ Recovery Verification Checklist

After any major incident:

- [ ] Connection shows "Connected" in Salesloft
- [ ] Correct instance URL confirmed
- [ ] All users have CRM IDs mapped
- [ ] Test activity syncs successfully
- [ ] No sync errors in past hour
- [ ] API usage below 80%
- [ ] Monitoring alerts configured
- [ ] Documentation updated
- [ ] Team notified of resolution
- [ ] Post-mortem scheduled (if needed)

---

**Document Version**: 1.0
**Last Updated**: September 2025
**Review Frequency**: After each incident
**Owner**: Sales Operations Team

**Remember**: Stay calm, follow procedures, and document everything. Most issues can be resolved in under 30 minutes with the right approach!