# 🧪 Google Drive Integration Test Scenarios

## Ready to Test with Claude!

Your Google Drive integration is configured and ready. Here are specific test scenarios you can try right now:

## 📁 1. Basic Drive Operations

### Test Listing Files
```
"Hey Claude, can you list the folders in my Google Drive?"
"Show me what's in my RevPal folder"
"Check if there are any reports in my Drive"
```

### Test Creating Documents
```
"Create a test document in my Google Drive"
"Make a new folder called RevPal/TestReports in Drive"
```

## 📊 2. Salesforce Report Export

### Simple Report Export
```
"Create a simple Salesforce opportunity report and export it to Google Sheets"
```

### Pipeline Report
```
"Export this quarter's Salesforce pipeline to a Google Sheet with charts"
```

### Executive Dashboard
```
"Create an executive dashboard in Google Sheets with Salesforce KPIs"
```

## 📈 3. HubSpot Analytics Export

### Marketing Report
```
"Export HubSpot marketing performance metrics to Google Sheets"
```

### Lead Analysis
```
"Create a lead source analysis in Google Sheets from HubSpot data"
```

### Campaign ROI
```
"Generate a campaign ROI report in Drive from HubSpot"
```

## 📄 4. Document Management

### Access Documentation
```
"Check if we have any compliance documentation in Google Drive"
"Find all Salesforce documentation in the RevPal Drive folder"
"Show me the latest requirements document from Drive"
```

### Template Retrieval
```
"Get the Apex class template from our Drive library"
"Show me available email templates in Drive"
"Find the standard report template"
```

## 🔄 5. Cross-Platform Operations

### Combined Reporting
```
"Create a combined Salesforce and HubSpot dashboard in Google Sheets"
```

### Data Comparison
```
"Export lead data from both Salesforce and HubSpot to compare in Sheets"
```

### Executive Summary
```
"Generate a weekly executive summary combining both platforms in Drive"
```

## 🎯 6. Specific Agent Tests

### Test gdrive-document-manager
```
"Use the document manager to find all project documentation"
```

### Test gdrive-report-exporter
```
"Use the report exporter to create a revenue dashboard in Sheets"
```

### Test gdrive-template-library
```
"Use the template library to show available Apex templates"
```

## 📝 7. Sample Data Creation

### Create Test Report Data
```
"Create a sample sales report with dummy data and export to Sheets"
```

### Generate Template
```
"Create a new email template and save it to the Drive template library"
```

### Build Documentation
```
"Create a implementation guide document in the Drive Documentation folder"
```

## 🔧 Manual Setup Required

Before testing exports, manually create these folders in Google Drive:

1. **Open Google Drive** (https://drive.google.com)
2. **Create main folder**: `RevPal`
3. **Add subfolders**:
   - `RevPal/Reports`
   - `RevPal/Templates`
   - `RevPal/Documentation`
   - `RevPal/Compliance`

## ✅ Success Indicators

Your integration is working when:
- Claude can list your Drive folders
- Reports export successfully to Sheets
- Documents can be retrieved from Drive
- Templates are accessible
- Cross-platform dashboards generate

## 🚨 Troubleshooting

If any test fails:

### Authentication Issues
```bash
# Re-authenticate
npx -y @modelcontextprotocol/server-gdrive auth --reset
```

### Check Configuration
```bash
# Run validation
./scripts/test-gdrive-integration.sh
```

### Verify MCP Status
```
"Claude, check the status of the gdrive MCP server"
```

## 📚 Quick Reference

- **New Agents**: gdrive-document-manager, gdrive-report-exporter, gdrive-template-library
- **Enhanced Agents**: sfdc-reports-dashboards, hubspot-reporting-builder
- **MCP Server**: Configured in `.mcp.json`
- **Credentials**: Stored securely and authenticated
- **Documentation**: `/documentation/GOOGLE_DRIVE_INTEGRATION.md`

## 🎉 Start Testing!

Pick any scenario above and try it with Claude. The integration is ready and waiting for your commands!

---
*Created: 2025-01-05*
*Status: Integration Active ✅*