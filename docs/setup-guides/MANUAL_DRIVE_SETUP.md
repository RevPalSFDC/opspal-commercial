# 📁 Manual Google Drive Setup Guide

## Quick Setup (5-10 minutes)

Since full programmatic folder creation requires additional authentication scopes, here's a quick manual setup guide. You can create the folder structure directly in Google Drive.

## Step 1: Open Google Drive
Go to: https://drive.google.com

## Step 2: Create Main Folder
1. Click "New" → "Folder"
2. Name it: **RevPal**
3. Open the RevPal folder

## Step 3: Create Primary Folders
Inside RevPal, create these 5 main folders:
- 📄 **Documentation**
- 📊 **Reports**  
- 🎨 **Templates**
- 🔒 **Compliance**
- 📦 **Archives**

## Step 4: Create Subfolders

### Inside Documentation:
- Salesforce
- HubSpot
- Integration

### Inside Reports:
Create **Salesforce** folder with:
- Daily
- Weekly
- Monthly

Create **HubSpot** folder with:
- Marketing
- Sales
- Service

Create **Combined** folder with:
- Executive
- Operational

### Inside Templates:
Create **Salesforce** folder with:
- Apex
- Lightning
- Flows

Create **HubSpot** folder with:
- Workflows
- Emails
- Forms

Create **Documentation** folder

### Inside Compliance:
- GDPR
- HIPAA
- SOC2
- CCPA

### Inside Archives:
Create **2025** folder

## Step 5: Quick Copy-Paste Structure

Here's the complete structure for reference:

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
│   ├── SOC2/
│   └── CCPA/
└── Archives/
    └── 2025/
```

## Step 6: Share Folders (Optional)
1. Right-click the RevPal folder
2. Select "Share"
3. Add team members with appropriate permissions:
   - **Viewer**: Read-only access
   - **Commenter**: Can view and comment
   - **Editor**: Full edit access

## Step 7: Test the Integration

Once folders are created, test with Claude:

```
"List the folders in my RevPal Drive folder"
"Show me what's in RevPal/Reports"
"Create a test document in RevPal/Documentation"
```

## ✅ Verification Checklist

- [ ] RevPal root folder created
- [ ] Documentation folder with 3 subfolders
- [ ] Reports folder with Salesforce, HubSpot, Combined subfolders
- [ ] Templates folder with platform-specific subfolders
- [ ] Compliance folder with regulation subfolders
- [ ] Archives folder with 2025 subfolder

## 🎯 Ready to Use!

Once you've created these folders, your Google Drive integration is fully operational. The Claude agents can now:
- Access documents from these folders
- Export reports to the Reports folder
- Store templates in the Templates folder
- Archive old data in the Archives folder

## 💡 Pro Tips

1. **Star the RevPal folder** for quick access
2. **Add to Quick Access** by right-clicking and selecting "Add to Quick Access"
3. **Use Google Drive desktop app** for easier file management
4. **Set up folder colors** to visually distinguish different categories

## 🚀 Next Steps

After creating folders:
1. Test document access: "Get a document from RevPal/Documentation"
2. Test report export: "Export a test report to RevPal/Reports/Salesforce"
3. Test template storage: "Save this as a template in RevPal/Templates"

---
*Manual setup typically takes 5-10 minutes*
*Once complete, all automated features will work*