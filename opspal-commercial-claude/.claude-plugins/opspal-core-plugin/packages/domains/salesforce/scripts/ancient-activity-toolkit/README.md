# Ancient Activity Analyzer Toolkit

## 🎯 Purpose
Discover and analyze hidden historical activity records in Salesforce organizations that are older than standard retention periods. This toolkit helps identify:
- Ghost activities (records showing activity dates but missing actual activities)
- Ancient email archives
- Purged Tasks/Events that still leave traces
- Data retention policy gaps
- Integration debt from disconnected systems

## 🚀 Quick Start

```bash
# Basic usage - analyze records older than 3 years
python3 ancient-activity-analyzer.py --org production

# Custom cutoff period (5 years)
python3 ancient-activity-analyzer.py --org myorg --years 5

# Export to specific directory
python3 ancient-activity-analyzer.py --org myorg --export-path ./analysis/

# Full analysis with all options
python3 ancient-activity-analyzer.py \
    --org production \
    --years 3 \
    --export-path ./reports/ \
    --verbose
```

## 📋 Prerequisites

1. **Salesforce CLI** installed and authenticated:
   ```bash
   # Install SF CLI
   npm install -g @salesforce/cli

   # Authenticate
   sf org login web --alias myorg
   ```

2. **Python 3.7+** with required packages:
   ```bash
   pip install python-dateutil pytz
   ```

3. **Permissions** in Salesforce:
   - API Enabled
   - View All Data (recommended)
   - Access to EmailMessage, Task, Event, Case objects

## 📊 What It Analyzes

### 1. Standard Activities
- Tasks and Events older than cutoff date
- Discovers auto-deletion patterns

### 2. Email Archives
- EmailMessage records (often retained indefinitely)
- Sender/recipient classification
- Subject pattern analysis

### 3. Ghost Activities
- Accounts/Contacts with LastActivityDate but no actual activities
- Evidence of purged records

### 4. Custom Activity Objects
- Searches for custom objects with activity-like data
- Identifies non-standard retention patterns

### 5. Hidden Archives
- ActivityHistory (if accessible)
- Archived Activities
- Recycle Bin (requires special permissions)

## 📁 Output Files

The analyzer creates these files in your export directory:

```
ancient_activities_[timestamp]/
├── ancient_activities_report_[timestamp].json     # Full analysis data
├── ANCIENT_ACTIVITIES_EXECUTIVE_SUMMARY.md       # Executive summary
├── EMAIL_CLASSIFICATION_SUMMARY.md               # Email analysis
├── email_classification_[timestamp].json         # Detailed email data
├── ancient_emails_sample.csv                     # Sample of ancient emails
└── ghost_activities.csv                          # Accounts/Contacts with ghost activities
```

## 🔍 Key Findings It Discovers

### Common Discoveries
1. **Auto-deletion patterns**: Tasks/Events deleted after ~2 years
2. **Email retention**: EmailMessages kept indefinitely
3. **Ghost activities**: Records showing activity but missing actual data
4. **Client churn evidence**: Through auto-reply patterns
5. **Integration debt**: Disconnected systems still sending notifications

### Business Impact
- **Compliance gaps**: Missing audit trails
- **Storage costs**: Hidden data consuming space
- **Analytics blind spots**: Incomplete historical data
- **Security risks**: Abandoned integrations

## 🎨 Customization

### Modify Analysis Scope
Edit `ancient-activity-analyzer.py` to adjust:
- `DEFAULT_CUTOFF_YEARS`: Change default from 3 years
- `EMAIL_BATCH_SIZE`: Adjust for API limits (default 2000)
- Add custom objects to analyze in `_find_custom_activity_objects()`

### Add Custom Reports
Extend the `_generate_executive_summary()` method to include:
- Industry-specific metrics
- Custom object analysis
- Compliance-specific findings

## 🚨 Troubleshooting

### Common Issues

1. **"Object type 'ActivityHistory' is not supported"**
   - ActivityHistory requires special API access
   - This is normal and doesn't affect other analyses

2. **"ALL ROWS not allowed"**
   - Recycle Bin queries require "View All Data" permission
   - Contact your Salesforce admin for access

3. **Query timeout errors**
   - Reduce batch sizes in the script
   - Use date filters to limit scope

4. **No ancient records found**
   - Verify your org has data older than cutoff
   - Check if data purging policies are aggressive
   - Try increasing the --years parameter

## 📈 Use Cases

### 1. Compliance Audit
```bash
# Check 7-year retention for compliance
python3 ancient-activity-analyzer.py --org production --years 7
```

### 2. Storage Optimization
```bash
# Identify data consuming unnecessary storage
python3 ancient-activity-analyzer.py --org production --export-path ./storage-audit/
```

### 3. Migration Planning
```bash
# Analyze before migrating to new CRM
python3 ancient-activity-analyzer.py --org legacy --years 10
```

### 4. Integration Cleanup
```bash
# Find disconnected integrations
python3 ancient-activity-analyzer.py --org production --verbose
# Check EMAIL_CLASSIFICATION_SUMMARY.md for external senders
```

## 🔐 Security Considerations

- Never commit analysis results to version control (contains sensitive data)
- Add `ancient_activities_*/` to `.gitignore`
- Review email samples before sharing with stakeholders
- Sanitize customer data in reports if needed

## 📚 Understanding the Results

### Executive Summary Sections
1. **Key Finding**: Headline discovery (e.g., "75,923 Hidden Records Found")
2. **Distribution**: Breakdown by object type and year
3. **Business Impact**: Storage costs and compliance risks
4. **Critical Findings**: Most important discoveries
5. **Recommendations**: Actionable next steps

### Email Classification
- **Lead Management**: Automated lead distribution emails
- **Property Management**: Direct customer correspondence
- **Marketing/Outreach**: Business development
- **Support Operations**: Internal tickets and cases

### Ghost Activities
- Records showing `LastActivityDate` but no actual Task/Event records
- Indicates aggressive data purging policies
- May affect reporting and analytics

## 🤝 Contributing

To extend this toolkit:

1. Add new analysis modules in the main class
2. Update `run_analysis()` to call new modules
3. Add findings to executive summary generation
4. Document new discoveries in this README

## 📞 Support

For questions or issues:
1. Check Salesforce API permissions
2. Verify SF CLI authentication
3. Review error messages in verbose mode
4. Check Salesforce Governor Limits

## 📝 License

Internal tool - not for external distribution

---
*Version 1.0 - Instance-agnostic ancient activity analysis*
*Created: September 2025*