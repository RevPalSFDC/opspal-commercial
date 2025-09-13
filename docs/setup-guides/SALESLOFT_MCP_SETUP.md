# Salesloft MCP Server Setup Guide

## Overview
This guide documents the setup and configuration of the Salesloft MCP server for monitoring and diagnosing sync issues between Salesloft and Salesforce.

## Configuration Status
- **API Key**: Configured in `.env`
- **MCP Server**: Added to `.mcp.json`
- **Instance**: Default instance configured

## Authentication Configuration

### API Key Setup
The Salesloft API key has been configured in the environment:
```bash
# .env file
SALESLOFT_API_KEY=v2_ak_101314_[redacted]
```

### MCP Server Configuration
The Salesloft MCP server has been added to `.mcp.json`:
```json
"salesloft": {
  "command": "npx",
  "args": ["-y", "@cdata/salesloft-mcp-server"],
  "env": {
    "SALESLOFT_API_KEY": "${SALESLOFT_API_KEY}",
    "SALESLOFT_INSTANCE": "default"
  },
  "disabled": false,
  "description": "Salesloft CRM integration for sync monitoring and diagnostics"
}
```

## Available Capabilities

### Read Operations
- Query sync logs and activity data
- Retrieve failed sync records
- Monitor data discrepancies
- Analyze sync patterns

### SQL Query Examples
```sql
-- Check failed syncs
SELECT * FROM sync_logs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 100;

-- Monitor API errors
SELECT * FROM api_logs WHERE response_code >= 400 AND created_at > NOW() - INTERVAL '24 hours';

-- Find activities not synced to Salesforce
SELECT * FROM activities WHERE salesforce_sync_status != 'success';

-- Analyze sync frequency
SELECT DATE(synced_at) as sync_date, COUNT(*) as sync_count 
FROM sync_logs 
GROUP BY DATE(synced_at) 
ORDER BY sync_date DESC;
```

## Testing the Connection

To verify the Salesloft MCP server is working:

1. **Load environment variables**:
   ```bash
   source /home/chris/Desktop/RevPal/Agents/.env
   ```

2. **Test with Claude Desktop**:
   - Restart Claude Desktop to load new MCP configuration
   - Use the Salesloft tools to query data

3. **Verify API key**:
   ```bash
   curl -H "Authorization: Bearer $SALESLOFT_API_KEY" \
        https://api.salesloft.com/v2/me.json
   ```

## Monitoring Use Cases

### 1. Sync Health Dashboard
Query sync logs periodically to identify:
- Failed sync attempts
- Sync frequency issues
- Data consistency problems

### 2. Error Tracking
Monitor API logs for:
- 429 rate limit errors
- 401 authentication failures
- 500 server errors

### 3. Data Validation
Compare records between Salesloft and Salesforce:
- Contact/Lead matching
- Activity logging verification
- Field mapping validation

## Limitations

- **Read-only access**: Cannot modify data or retry syncs
- **No real-time monitoring**: Requires periodic polling
- **No webhook support**: Cannot receive push notifications
- **Java dependency**: Requires Java runtime for CData driver

## Next Steps

1. **Create monitoring agent**: Build `salesloft-sync-monitor` agent
2. **Implement diagnostic queries**: Develop standard query library
3. **Set up alerting**: Configure threshold-based notifications
4. **Document troubleshooting**: Create sync issue resolution playbook

## Support

For issues with:
- **API Key**: Contact Salesloft support
- **MCP Server**: Check CData documentation
- **Integration**: Review this guide or contact RevPal team

---
Last Updated: 2025-09-11
API Key Instance: Default