# Salesforce-Salesloft Sync Diagnostic & Remediation Tools

A comprehensive suite of tools for diagnosing and resolving sync issues between Salesforce and Salesloft.

## Tools Overview

### 1. `sf-salesloft-sync-diagnostics.py`
**Purpose**: Comprehensive sync diagnostic tool that analyzes the health of your Salesforce-Salesloft integration.

**Features**:
- ✅ Bi-directional sync verification
- ✅ Field mapping validation
- ✅ Duplicate detection
- ✅ Error pattern analysis
- ✅ Performance metrics
- ✅ Automated remediation suggestions

**Usage**:
```bash
# Run full diagnostic
python sf-salesloft-sync-diagnostics.py

# Quick diagnostic (skip detailed checks)
python sf-salesloft-sync-diagnostics.py --quick

# Focus on specific area
python sf-salesloft-sync-diagnostics.py --focus errors
python sf-salesloft-sync-diagnostics.py --focus duplicates
python sf-salesloft-sync-diagnostics.py --focus performance

# Analyze last 30 days
python sf-salesloft-sync-diagnostics.py --days 30

# Export report in different formats
python sf-salesloft-sync-diagnostics.py --export json
```

### 2. `sync-dashboard.py`
**Purpose**: Real-time monitoring dashboard for sync operations with live metrics and alerts.

**Features**:
- 📊 Live sync status monitoring
- 📈 Real-time error tracking
- ⚡ Performance metrics visualization
- 🔔 Automated alerting
- 📉 Trend analysis

**Usage**:
```bash
# Start the dashboard
python sync-dashboard.py

# Dashboard controls:
# - Press Ctrl+C to exit
# - Press 'R' to refresh manually
# - Press 'E' to export current state
```

### 3. `sync-remediation.py`
**Purpose**: Automated remediation tool that fixes common sync issues without manual intervention.

**Features**:
- 🔧 Automatic duplicate merging
- 📝 Missing field completion
- 🔄 Failed record re-sync
- 🗑️ Orphaned record cleanup
- ⚙️ Configuration optimization

**Usage**:
```bash
# Dry run (preview changes without applying)
python sync-remediation.py --dry-run

# Apply all fixes
python sync-remediation.py

# Focus on specific issue type
python sync-remediation.py --focus duplicates
python sync-remediation.py --focus missing_fields
python sync-remediation.py --focus failed_syncs

# Auto-approve all fixes (use with caution!)
python sync-remediation.py --auto-approve
```

## Setup Requirements

### Environment Variables
```bash
# Required
export SALESLOFT_TOKEN="your-salesloft-api-token"
export SALESFORCE_ORG_ALIAS="your-sf-org-alias"  # Default: production

# Optional
export SYNC_ALERT_EMAIL="admin@company.com"  # For email alerts
export SYNC_WEBHOOK_URL="https://..."       # For Slack/webhook alerts
```

### Prerequisites
1. **Python 3.8+** with required packages:
   ```bash
   pip install requests rich websocket-client
   ```

2. **Salesforce CLI** installed and authenticated:
   ```bash
   sf org login web --alias production
   ```

3. **Salesloft API Token** with read/write permissions

## Common Use Cases

### Daily Health Check
```bash
# Morning diagnostic routine
python sf-salesloft-sync-diagnostics.py --quick
```

### Investigating Sync Failures
```bash
# 1. Run diagnostic focused on errors
python sf-salesloft-sync-diagnostics.py --focus errors

# 2. Monitor in real-time
python sync-dashboard.py

# 3. Apply automated fixes
python sync-remediation.py --focus failed_syncs
```

### Cleaning Up Duplicates
```bash
# 1. Identify duplicates
python sf-salesloft-sync-diagnostics.py --focus duplicates

# 2. Preview cleanup actions
python sync-remediation.py --focus duplicates --dry-run

# 3. Apply cleanup
python sync-remediation.py --focus duplicates
```

### Performance Troubleshooting
```bash
# 1. Analyze performance metrics
python sf-salesloft-sync-diagnostics.py --focus performance --days 7

# 2. Monitor live performance
python sync-dashboard.py

# 3. Optimize configuration
python sync-remediation.py --focus configuration
```

## Output & Reports

All tools generate detailed JSON reports saved to:
```
/home/chris/Desktop/RevPal/Agents/reports/
```

Report files include:
- `sync_diagnostic_YYYYMMDD_HHMMSS.json` - Full diagnostic reports
- `sync_dashboard_YYYYMMDD_HHMMSS.json` - Dashboard state snapshots
- `sync_remediation_YYYYMMDD_HHMMSS.json` - Remediation action logs

## Troubleshooting

### "SALESLOFT_TOKEN not set" Error
```bash
export SALESLOFT_TOKEN="your-token-here"
```

### Salesforce Connection Issues
```bash
# Re-authenticate
sf org login web --alias production

# Verify connection
sf org display --target-org production
```

### Rate Limiting
The tools automatically handle rate limits with exponential backoff. If you encounter persistent rate limit issues:
1. Reduce request frequency in the dashboard
2. Use `--dry-run` mode for testing
3. Contact Salesloft support to increase API limits

## Advanced Configuration

### Custom Field Mappings
Edit the field mappings in `sf-salesloft-sync-diagnostics.py`:
```python
self.sync_mappings = {
    "Contact": {
        "sf_to_sl": {
            "CustomField__c": "custom_field"
        }
    }
}
```

### Alert Thresholds
Modify alert thresholds in `sync-dashboard.py`:
```python
ALERT_THRESHOLD_ERROR_RATE = 0.1  # 10% error rate
ALERT_THRESHOLD_LATENCY = 10      # 10 seconds
```

### Remediation Defaults
Configure default values in `sync-remediation.py`:
```python
defaults = {
    "person": {
        "country": "United States",
        "title": "N/A"
    }
}
```

## Best Practices

1. **Regular Monitoring**: Run diagnostics daily to catch issues early
2. **Staged Remediation**: Use `--dry-run` before applying fixes
3. **Backup First**: Export current state before major remediation
4. **Monitor After Changes**: Keep dashboard running after remediation
5. **Document Issues**: Save diagnostic reports for trend analysis

## Support & Contribution

For issues or feature requests, please contact your DevOps team or create a ticket in the internal tracking system.

## Version History

- **v1.0.0** (2024-01-09): Initial release with core diagnostic, monitoring, and remediation features

---
*Built with ❤️ for RevPal Sync Operations*