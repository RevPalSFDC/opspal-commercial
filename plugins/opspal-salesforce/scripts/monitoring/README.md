# Salesforce Proactive Monitoring System

A comprehensive monitoring system for Salesforce flow health, validation rules, and system performance with automated alerts and trend analysis.

## 🚨 Overview

This monitoring system provides proactive health checks for your Salesforce org with the following capabilities:

- **Daily Flow Complexity Audits** - Identifies flows exceeding complexity thresholds
- **Weekly Consolidation Checks** - Validates Flow Consolidation Principle compliance
- **Validation Rule Monitoring** - Tracks changes that might affect deployments
- **System Health Dashboard** - Real-time health scoring and trend analysis

## 📋 Quick Start

### 1. Install Dependencies

```bash
# Install required packages
sudo apt-get install jq mailutils nodejs npm  # Ubuntu/Debian
# OR
sudo yum install jq mailx nodejs npm          # RHEL/CentOS
# OR  
brew install jq mailutils node                # macOS

# Install Salesforce CLI
npm install -g @salesforce/cli

# Authenticate to your org
sf auth web login --alias production
```

### 2. Configure Monitoring

Edit `monitoring-config.json` to customize:

```json
{
  "monitoring": {
    "defaultOrg": "production",
    "alerting": {
      "email": {
        "enabled": true,
        "defaultRecipients": ["devteam@company.com"]
      }
    },
    "thresholds": {
      "flowComplexity": {
        "warning": 7,
        "critical": 15
      }
    }
  }
}
```

### 3. Setup Automated Monitoring

```bash
# Setup cron jobs for automated monitoring
./setup-monitoring-crons.sh --org production

# Or preview what would be installed
./setup-monitoring-crons.sh --org production --dry-run
```

### 4. View Health Dashboard

```bash
# Generate health dashboard
node system-health-dashboard.js --org production

# Start web dashboard server
node system-health-dashboard.js --org production --serve --port 3000
```

## 📊 Monitoring Scripts

### Daily Flow Complexity Audit (`flow-complexity-audit.js`)

**Purpose:** Identifies flows with high complexity that may need refactoring

**Schedule:** Daily at 2 AM  
**Triggers:** Complexity score ≥ 7 (configurable)

```bash
# Manual execution
node flow-complexity-audit.js --org production --email devteam@company.com

# Key features:
# - Automated complexity scoring algorithm
# - EXPLAIN plan generation recommendations  
# - Governor limit impact analysis
# - Performance optimization suggestions
```

**Complexity Scoring Algorithm:**
- Decision elements: 2 points each
- Loop elements: 3 points each  
- Subflow calls: 2 points each
- Trigger type multipliers (1.5x for record-triggered)
- Custom Apex integrations: 4 points each

### Weekly Consolidation Check (`flow-consolidation-validator.sh`)

**Purpose:** Validates Flow Consolidation Principle: ONE FLOW PER OBJECT PER TRIGGER TYPE

**Schedule:** Weekly on Sunday at 6 AM
**Triggers:** Multiple flows detected on same object/trigger

```bash
# Manual execution
./flow-consolidation-validator.sh --org production --email devteam@company.com

# Generate consolidation plan
./flow-consolidation-validator.sh --org production --auto-fix

# Key features:
# - Violation detection with severity scoring
# - Consolidation recommendations
# - Step-by-step remediation plans
# - Impact analysis and effort estimation
```

### Validation Rule Monitor (`validation-rule-monitor.js`)

**Purpose:** Tracks validation rule changes that might affect deployments or flows

**Schedule:** Daily at 7 AM
**Triggers:** New rules, formula changes, PRIORVALUE patterns

```bash
# Create baseline (first run)
node validation-rule-monitor.js --org production --baseline

# Daily monitoring
node validation-rule-monitor.js --org production --email devteam@company.com

# Key features:
# - Change detection with content hashing
# - PRIORVALUE pattern detection (affects flows)  
# - Deployment risk analysis
# - Hardcoded ID detection
# - Cross-object reference validation
```

**Risk Patterns Detected:**
- `PRIORVALUE()` functions (HIGH risk - blocks flows)
- Hardcoded record IDs (CRITICAL - deployment failure)
- Environment-specific references (HIGH risk)
- Complex nested formulas (MEDIUM - performance)
- Profile/role dependencies (LOW - admin access)

### System Health Dashboard (`system-health-dashboard.js`)

**Purpose:** Aggregates all monitoring data into comprehensive health dashboard

**Schedule:** Daily at 8 AM
**Features:** Trend analysis, health scoring, actionable insights

```bash
# Generate static dashboard
node system-health-dashboard.js --org production --days 30

# Start real-time web dashboard  
node system-health-dashboard.js --org production --serve --port 3000

# Key features:
# - Overall health score calculation
# - Trend analysis and anomaly detection
# - Interactive charts and visualizations
# - Actionable insights with priorities
# - Real-time monitoring capabilities
```

**Health Scoring:**
- **Excellent (90-100%):** 🟢 All systems optimal
- **Good (80-89%):** 🔵 Minor issues, monitoring recommended  
- **Fair (60-79%):** 🟡 Attention needed, plan improvements
- **Poor (<60%):** 🔴 Critical issues, immediate action required

## 🔧 Configuration

### Monitoring Configuration (`monitoring-config.json`)

```json
{
  "monitoring": {
    "defaultOrg": "production",
    "schedules": {
      "dailyComplexityAudit": {
        "enabled": true,
        "cron": "0 2 * * *",
        "options": {
          "threshold": 7,
          "email": "devteam@company.com"
        }
      }
    },
    "thresholds": {
      "flowComplexity": {
        "warning": 7,
        "critical": 15
      }
    }
  }
}
```

### Email Configuration

Configure SMTP settings for email alerts:

```json
{
  "alerting": {
    "email": {
      "enabled": true,
      "defaultRecipients": ["devteam@company.com"],
      "highPriorityRecipients": ["manager@company.com"],
      "smtpConfig": {
        "host": "smtp.company.com",
        "port": 587,
        "secure": false
      }
    }
  }
}
```

### Organization-Specific Settings

```json
{
  "organizations": {
    "production": {
      "monitoring": {
        "enabled": true,
        "alertLevel": "high",
        "customThresholds": {
          "flowComplexity.critical": 12
        }
      }
    }
  }
}
```

## 📈 Reports and Dashboards

### Report Types Generated

**HTML Reports:**
- Interactive dashboards with charts
- Drill-down capability for details
- Mobile-responsive design
- Real-time refresh capability

**JSON Reports:**
- Machine-readable data
- API integration support
- Trend analysis data
- Historical comparisons

**CSV Reports:**
- Excel-compatible format
- Data analysis and pivot tables
- Bulk data processing
- Integration with BI tools

### Report Locations

```
reports/
├── daily-complexity/           # Flow complexity audits
│   ├── complexity-audit-2024-08-31.html
│   ├── complexity-audit-2024-08-31.json
│   └── complexity-audit-2024-08-31.csv
├── weekly-consolidation/       # Flow consolidation checks
│   ├── consolidation-report-2024-08-31.html
│   └── consolidation-plan-2024-08-31.md
├── validation-changes/         # Validation rule monitoring
│   ├── validation-changes-2024-08-31.html
│   └── validation-changes-2024-08-31.json
└── system-health/             # Health dashboards
    ├── health-dashboard-2024-08-31.html
    └── health-dashboard-latest.html
```

## 🚨 Alerting and Notifications

### Alert Priorities

**HIGH Priority:**
- Flow complexity score ≥ 15
- Flow consolidation violations
- PRIORVALUE validation rules
- System health score < 60%

**MEDIUM Priority:**
- Flow complexity score 7-14
- Recent validation rule changes
- System health score 60-79%

**LOW Priority:**
- Minor configuration changes
- Informational updates
- System health score 80-89%

### Alert Channels

**Email Alerts:**
- HTML formatted reports
- Attached detailed reports
- Escalation to management
- Configurable recipients

**Slack Integration:**
- Real-time notifications
- Channel-specific routing
- Message formatting
- Webhook configuration

**Task Creation:**
- Asana task creation
- JIRA issue creation
- Priority-based assignment
- Automatic follow-up

## 🔄 Automation and Scheduling

### Cron Schedule Overview

```bash
# Daily Flow Complexity Audit - 2 AM
0 2 * * * node flow-complexity-audit.js --org production

# Weekly Consolidation Check - Sunday 6 AM
0 6 * * 0 ./flow-consolidation-validator.sh --org production

# Daily Validation Monitor - 7 AM  
0 7 * * * node validation-rule-monitor.js --org production

# System Health Dashboard - 8 AM
0 8 * * * node system-health-dashboard.js --org production
```

### Setup Automation

```bash
# Install all cron jobs
./setup-monitoring-crons.sh --org production

# Remove all monitoring crons
./setup-monitoring-crons.sh --remove

# Preview what would be installed
./setup-monitoring-crons.sh --dry-run --org production
```

### Log Management

**Automatic Log Rotation:**
- Daily rotation of log files
- 30-day retention period
- Compression of old logs
- Automatic cleanup of reports

**Log Locations:**
```
reports/
├── cron-flow-complexity-audit.log
├── cron-flow-consolidation-validator.log
├── cron-validation-rule-monitor.log
└── cron-system-health-dashboard.log
```

## 🛠 Troubleshooting

### Common Issues

**Authentication Errors:**
```bash
# Check org connection
sf org display --target-org production

# Re-authenticate if needed
sf auth web login --alias production
```

**Permission Errors:**
```bash
# Check Tooling API access
sf data query --query "SELECT COUNT() FROM ValidationRule" --use-tooling-api --target-org production

# Verify SOQL query permissions
sf data query --use-tooling-api --query "SELECT COUNT() FROM FlowDefinition" --target-org production
```

**Email Delivery Issues:**
```bash
# Test email configuration
echo "Test message" | mailx -s "Test Subject" user@company.com

# Check mailx configuration
mail -V
```

**Cron Job Issues:**
```bash
# Check cron service status
systemctl status cron

# Verify cron jobs installed
crontab -l | grep monitoring

# Check cron logs
tail -f /var/log/syslog | grep CRON
```

### Debug Mode

Enable verbose logging:

```bash
# Enable debug logging in scripts
export DEBUG=true

# Check monitoring utilities
node monitoring-utils.js test-config

# Run maintenance operations
node monitoring-utils.js maintenance
```

## 🔒 Security and Compliance

### Data Privacy
- No sensitive data stored in reports
- Configurable data retention policies
- Secure credential management
- Audit trail maintenance

### Access Control
- Org-level permission requirements
- Email recipient validation
- File permission management
- Secure report sharing

### Compliance Features
- SOC 2 compliance support
- Audit trail generation
- Change impact analysis
- Risk assessment reporting

## 📚 Best Practices

### Implementation Guidelines

1. **Start with Baseline Creation:**
   ```bash
   node validation-rule-monitor.js --org production --baseline
   ```

2. **Test Before Production:**
   ```bash
   # Test on sandbox first
   ./setup-monitoring-crons.sh --org sandbox --dry-run
   ```

3. **Configure Alert Fatigue Prevention:**
   - Set appropriate thresholds
   - Use escalation policies
   - Implement alert suppression
   - Regular threshold reviews

4. **Monitor the Monitors:**
   - Check cron execution logs
   - Verify email delivery
   - Review dashboard accessibility
   - Validate data accuracy

### Maintenance Schedule

**Weekly:**
- Review alert accuracy
- Check log file sizes
- Verify cron execution
- Update thresholds if needed

**Monthly:**
- Analyze trend reports
- Review threshold effectiveness
- Update recipient lists
- Performance optimization

**Quarterly:**
- Full system review
- Configuration updates
- Process improvements
- Training updates

## 🔗 Integration Examples

### Asana Task Creation

```bash
# Configure in monitoring-config.json
{
  "integrations": {
    "asana": {
      "enabled": true,
      "createTasks": true,
      "projectId": "1234567890",
      "assigneeId": "0987654321"
    }
  }
}
```

### JIRA Issue Creation

```bash
{
  "integrations": {
    "jira": {
      "enabled": true,
      "createIssues": true,
      "project": "SFDC",
      "issueType": "Bug"
    }
  }
}
```

### Slack Notifications

```bash
{
  "alerting": {
    "slack": {
      "enabled": true,
      "webhookUrl": "https://hooks.slack.com/services/...",
      "channel": "#salesforce-alerts"
    }
  }
}
```

## 📞 Support and Contribution

### Getting Help

1. **Check Documentation:** Review this README and inline script comments
2. **Test Configuration:** Use `--dry-run` and `test-config` options
3. **Review Logs:** Check cron logs and script output files
4. **Verify Prerequisites:** Ensure all dependencies are installed

### Contributing Improvements

1. **Add New Monitoring Scripts:** Follow existing patterns and naming conventions
2. **Enhance Configurations:** Add new thresholds and alert types
3. **Improve Dashboards:** Add new charts and visualization options
4. **Extend Integrations:** Add support for additional notification channels

### Version History

- **v1.0.0:** Initial release with core monitoring features
- **v1.1.0:** Added web dashboard and real-time monitoring
- **v1.2.0:** Enhanced alert configuration and integration support

---

**🎯 Remember:** This monitoring system implements Flow Consolidation Best Practices and provides proactive health management for your Salesforce org. Regular monitoring prevents issues before they impact users and deployments.
