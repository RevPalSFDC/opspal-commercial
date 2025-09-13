# Google Drive MCP Integration Guide

## Overview
This guide provides step-by-step instructions for setting up and using the Google Drive MCP server integration with ClaudeSFDC and ClaudeHubSpot projects.

## Prerequisites

### Required Components
- Node.js v16 or higher
- Google Cloud Platform account
- Google Workspace access
- Claude Code with MCP support

### Permissions Needed
- Google Cloud Project creation
- OAuth 2.0 client configuration
- Google Drive API enablement
- Folder creation in Google Drive

## Setup Instructions

### Step 1: Google Cloud Configuration

1. **Create Google Cloud Project**
   ```bash
   # Visit https://console.cloud.google.com
   # Create new project: "RevPal-Drive-Integration"
   ```

2. **Enable Google Drive API**
   ```bash
   # In Google Cloud Console:
   # APIs & Services → Enable APIs → Search "Google Drive API" → Enable
   ```

3. **Create OAuth 2.0 Credentials**
   ```bash
   # APIs & Services → Credentials → Create Credentials → OAuth client ID
   # Application Type: Desktop app
   # Name: RevPal-MCP-Client
   # Download JSON credentials
   ```

### Step 2: Environment Configuration

1. **Set Environment Variables**
   ```bash
   # Add to .env file (create if doesn't exist)
   GDRIVE_CLIENT_ID=your-client-id-here
   GDRIVE_CLIENT_SECRET=your-client-secret-here
   GDRIVE_REDIRECT_URI=http://localhost:3000/oauth/callback
   ```

2. **Verify MCP Configuration**
   ```bash
   # Check .mcp.json includes gdrive server
   cat .mcp.json | grep gdrive
   ```

### Step 3: Authentication Setup

1. **Initial Authentication**
   ```bash
   # First-time setup will prompt for Google login
   npx @modelcontextprotocol/server-gdrive auth
   ```

2. **Grant Permissions**
   - Read access to Google Drive files
   - Export Google Workspace files
   - Create new files (if write access needed)

3. **Verify Connection**
   ```bash
   # Test connection
   npx @modelcontextprotocol/server-gdrive test
   ```

### Step 4: Drive Folder Structure

Create the following folder structure in Google Drive:

```
RevPal/
├── Documentation/
│   ├── Salesforce/
│   ├── HubSpot/
│   └── Integration/
├── Reports/
│   ├── Salesforce/
│   │   ├── Daily/
│   │   ├── Weekly/
│   │   └── Monthly/
│   ├── HubSpot/
│   │   ├── Marketing/
│   │   ├── Sales/
│   │   └── Service/
│   └── Combined/
│       ├── Executive/
│       └── Operational/
├── Templates/
│   ├── Salesforce/
│   │   ├── Apex/
│   │   ├── Lightning/
│   │   └── Flows/
│   ├── HubSpot/
│   │   ├── Workflows/
│   │   ├── Emails/
│   │   └── Forms/
│   └── Documentation/
├── Compliance/
│   ├── GDPR/
│   ├── HIPAA/
│   └── SOC2/
└── Archives/
    └── [Year]/
        └── [Month]/
```

### Step 5: Agent Configuration

The following agents are now configured with Google Drive access:

#### New Google Drive Agents
- **gdrive-document-manager** - Document access and retrieval
- **gdrive-report-exporter** - Report export to Sheets
- **gdrive-template-library** - Template management

#### Enhanced Existing Agents
- **sfdc-reports-dashboards** - Now exports to Google Sheets
- **hubspot-reporting-builder** - Now exports to Google Sheets
- **documentation-curator** - Can sync with Drive docs

## Usage Examples

### Export Salesforce Report to Google Sheets
```
User: "Export the Q4 sales pipeline report to Google Sheets"
Claude: [Uses sfdc-reports-dashboards with gdrive-report-exporter]
Result: Report exported to /RevPal/Reports/Salesforce/Monthly/Q4_Pipeline.gsheet
```

### Access Compliance Documentation
```
User: "Check GDPR compliance requirements for data retention"
Claude: [Uses gdrive-document-manager]
Result: Retrieved GDPR requirements from /RevPal/Compliance/GDPR/DataRetention.gdoc
```

### Use Template for Apex Class
```
User: "Create a new trigger handler using our standard template"
Claude: [Uses gdrive-template-library with sfdc-apex-developer]
Result: Template applied from /RevPal/Templates/Salesforce/Apex/TriggerHandler.template
```

### Create Executive Dashboard
```
User: "Create a combined Salesforce and HubSpot executive dashboard"
Claude: [Uses gdrive-report-exporter with both platform agents]
Result: Dashboard created at /RevPal/Reports/Combined/Executive/CEO_Dashboard.gsheet
```

## Security Best Practices

### Access Control
1. **Principle of Least Privilege**
   - Grant read-only access by default
   - Write access only when necessary
   - Folder-level permissions

2. **Authentication Security**
   - Store credentials in environment variables
   - Never commit credentials to git
   - Rotate credentials regularly

3. **Data Classification**
   - Separate folders for different sensitivity levels
   - Encrypt sensitive documents
   - Audit access logs regularly

### Compliance Considerations
- Ensure GDPR compliance for EU data
- Follow HIPAA guidelines for healthcare data
- Maintain SOC2 compliance for security
- Regular compliance audits

## Automation Capabilities

### Scheduled Exports
```yaml
# Example: Weekly report export
Schedule: Every Monday 8 AM
Action: Export Salesforce weekly pipeline report
Target: /RevPal/Reports/Salesforce/Weekly/
Format: Google Sheet with charts
Share: sales-team@company.com
```

### Triggered Sync
```yaml
# Example: On release completion
Trigger: Release tag created
Action: Archive release documentation
Source: Local release notes
Target: /RevPal/Archives/[Year]/[Month]/
```

### Batch Operations
```yaml
# Example: Monthly archive
Schedule: First day of month
Action: Archive previous month reports
Source: /RevPal/Reports/*/Daily/
Target: /RevPal/Archives/[Year]/[Month]/
```

## Troubleshooting

### Common Issues

#### Authentication Failures
```bash
# Error: Invalid credentials
Solution: Re-run authentication flow
npx @modelcontextprotocol/server-gdrive auth --reset
```

#### Rate Limiting
```bash
# Error: Rate limit exceeded
Solution: Implement exponential backoff
# Agents handle this automatically
```

#### Permission Denied
```bash
# Error: Insufficient permissions
Solution: Check folder sharing settings in Drive
# Ensure service account has access
```

#### Connection Timeouts
```bash
# Error: Connection timeout
Solution: Check network and proxy settings
# Verify firewall rules allow Google APIs
```

### Debug Commands
```bash
# Check MCP server status
claude mcp status gdrive

# View server logs
claude mcp logs gdrive

# Test specific operation
claude mcp test gdrive read /RevPal/Documentation/

# Restart server
claude mcp restart gdrive
```

## Performance Optimization

### Caching Strategy
- Frequently accessed documents cached locally
- Cache TTL: 15 minutes for documents
- Cache TTL: 5 minutes for reports
- Manual cache clear: `claude mcp cache clear gdrive`

### Batch Processing
- Group related operations
- Use bulk export for multiple reports
- Parallel processing for independent tasks

### Best Practices
1. Minimize API calls with smart caching
2. Use incremental sync for large datasets
3. Implement retry logic with backoff
4. Monitor quota usage regularly

## Monitoring & Maintenance

### Health Checks
```bash
# Daily health check
./scripts/gdrive-health-check.sh

# Quota usage
./scripts/gdrive-quota-status.sh

# Performance metrics
./scripts/gdrive-performance.sh
```

### Regular Maintenance
- Weekly: Review access logs
- Monthly: Audit folder permissions
- Quarterly: Rotate credentials
- Annually: Review folder structure

## Advanced Features

### Custom Integrations
- Webhook triggers for real-time sync
- Custom export formats
- Advanced sharing rules
- Automated compliance checks

### API Extensions
- Direct Drive API access for complex operations
- Custom metadata management
- Version control integration
- Advanced search capabilities

## Support & Resources

### Documentation
- [Google Drive API Documentation](https://developers.google.com/drive)
- [MCP Server Documentation](https://modelcontextprotocol.io)
- [OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)

### Getting Help
- RevPal Support: support@revpal.com
- MCP Community: https://github.com/modelcontextprotocol/
- Google Drive API Forum: https://groups.google.com/g/google-drive-api

### Related Guides
- [ClaudeSFDC Documentation](../ClaudeSFDC/README.md)
- [ClaudeHubSpot Documentation](../ClaudeHubSpot/README.md)
- [MCP Setup Guide](./MCP_SETUP.md)
- [Agent Development Guide](./AGENT_DEVELOPMENT.md)

## Changelog

### Version 1.0.0 (2025-01-05)
- Initial Google Drive MCP integration
- Created three new Drive-specific agents
- Enhanced reporting agents with export capability
- Comprehensive documentation

---

*Last Updated: 2025-01-05*
*Maintained by: RevPal Agent System*