# 🚀 Google Drive Integration - Quick Start

## ✅ Setup Complete!
Your Google Drive MCP integration is now configured and ready to use.

## 📁 Create These Folders in Your Google Drive

Open Google Drive and create this structure:
```
RevPal/
├── Documentation/
├── Reports/
│   ├── Salesforce/
│   └── HubSpot/
├── Templates/
└── Compliance/
```

## 🎯 Test Commands

Try these with Claude:

### Basic Tests
```
"List my Google Drive folders"
"Check if RevPal folder exists in Drive"
"Show me documents in the RevPal folder"
```

### Report Export
```
"Export a Salesforce opportunity report to Google Sheets"
"Create a HubSpot marketing dashboard in Google Sheets"
"Generate an executive summary in Drive"
```

### Template Access
```
"Show me available templates in Drive"
"Get the Apex trigger template from Drive"
"Access the email campaign template"
```

### Documentation
```
"Fetch the latest requirements from Drive"
"Check compliance documentation in Drive"
"Access the implementation guide"
```

## 🤖 Available Agents

### New Drive Agents
- **gdrive-document-manager** - Access docs and requirements
- **gdrive-report-exporter** - Export to Google Sheets
- **gdrive-template-library** - Manage templates

### Enhanced Agents
- **sfdc-reports-dashboards** - Now exports to Sheets
- **hubspot-reporting-builder** - Now exports to Drive

## 📊 Example Workflows

### Weekly Report Export
```
"Export this week's Salesforce pipeline report to Google Sheets and share with the sales team"
```

### Compliance Check
```
"Review our GDPR compliance requirements from Drive and verify our current implementation"
```

### Template Usage
```
"Create a new Apex class using the standard template from our Drive library"
```

## 🔧 Troubleshooting

### If authentication fails:
```bash
npx -y @modelcontextprotocol/server-gdrive auth --reset
```

### To verify setup:
```bash
./scripts/test-gdrive-integration.sh
```

### Check server status:
```bash
claude mcp status gdrive
```

## 📚 Documentation

Full guide: `/documentation/GOOGLE_DRIVE_INTEGRATION.md`

## 🎉 You're Ready!

Start using Google Drive integration with your RevPal agents. The integration enables:
- 📈 Automated report exports
- 📄 Centralized documentation
- 🎨 Template management
- 🤝 Team collaboration
- 📊 Executive dashboards

---
*Setup completed: 2025-01-05*