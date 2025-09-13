#!/usr/bin/env node

/**
 * Google Drive Folder Structure Setup Script
 * Creates the RevPal folder hierarchy in Google Drive
 */

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// Folder structure to create
const FOLDER_STRUCTURE = {
  'RevPal': {
    'Documentation': {
      'Salesforce': {},
      'HubSpot': {},
      'Integration': {}
    },
    'Reports': {
      'Salesforce': {
        'Daily': {},
        'Weekly': {},
        'Monthly': {},
        'Quarterly': {}
      },
      'HubSpot': {
        'Marketing': {},
        'Sales': {},
        'Service': {}
      },
      'Combined': {
        'Executive': {},
        'Operational': {}
      }
    },
    'Templates': {
      'Salesforce': {
        'Apex': {},
        'Lightning': {},
        'Flows': {},
        'Config': {}
      },
      'HubSpot': {
        'Workflows': {},
        'Emails': {},
        'Forms': {},
        'Landing Pages': {}
      },
      'Documentation': {}
    },
    'Compliance': {
      'GDPR': {},
      'HIPAA': {},
      'SOC2': {},
      'CCPA': {}
    },
    'Archives': {
      '2025': {
        'Q1': {},
        'Q2': {},
        'Q3': {},
        'Q4': {}
      }
    }
  }
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

class DriveSetup {
  constructor() {
    this.drive = null;
    this.createdFolders = new Map();
  }

  async authenticate() {
    console.log(`${colors.blue}🔐 Authenticating with Google Drive...${colors.reset}`);
    
    try {
      // Load credentials from the saved token
      const tokenPath = '/home/chris/.nvm/versions/node/v22.15.1/lib/node_modules/.gdrive-server-credentials.json';
      const token = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
      
      // Load OAuth2 credentials
      const credentialsPath = path.join(__dirname, '..', 'gcp-oauth.keys.json');
      const credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
      
      const { client_id, client_secret } = credentials.installed;
      const oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        'http://localhost:3000/oauth/callback'
      );
      
      oauth2Client.setCredentials(token);
      this.drive = google.drive({ version: 'v3', auth: oauth2Client });
      
      console.log(`${colors.green}✓ Authentication successful${colors.reset}`);
      return true;
    } catch (error) {
      console.error(`${colors.red}✗ Authentication failed:${colors.reset}`, error.message);
      console.log(`${colors.yellow}Please run: npx @modelcontextprotocol/server-gdrive auth${colors.reset}`);
      return false;
    }
  }

  async findExistingFolder(name, parentId = null) {
    try {
      let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      if (parentId) {
        query += ` and '${parentId}' in parents`;
      }
      
      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive'
      });
      
      return response.data.files.length > 0 ? response.data.files[0] : null;
    } catch (error) {
      console.error(`Error finding folder ${name}:`, error.message);
      return null;
    }
  }

  async createFolder(name, parentId = null) {
    // Check if folder already exists
    const existing = await this.findExistingFolder(name, parentId);
    if (existing) {
      console.log(`${colors.yellow}  ⚠ Folder already exists: ${name}${colors.reset}`);
      return existing.id;
    }

    try {
      const fileMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder'
      };
      
      if (parentId) {
        fileMetadata.parents = [parentId];
      }
      
      const response = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id, name'
      });
      
      console.log(`${colors.green}  ✓ Created folder: ${name}${colors.reset}`);
      return response.data.id;
    } catch (error) {
      console.error(`${colors.red}  ✗ Failed to create folder ${name}:${colors.reset}`, error.message);
      return null;
    }
  }

  async createFolderStructure(structure, parentId = null, level = 0) {
    const indent = '  '.repeat(level);
    
    for (const [folderName, subfolders] of Object.entries(structure)) {
      console.log(`${indent}📁 Processing: ${folderName}`);
      
      const folderId = await this.createFolder(folderName, parentId);
      
      if (folderId && Object.keys(subfolders).length > 0) {
        await this.createFolderStructure(subfolders, folderId, level + 1);
      }
      
      // Store the folder ID for the top-level RevPal folder
      if (folderName === 'RevPal' && !parentId) {
        this.createdFolders.set('root', folderId);
      }
    }
  }

  async createSampleFiles() {
    console.log(`\n${colors.blue}📄 Creating sample files...${colors.reset}`);
    
    const rootId = this.createdFolders.get('root');
    if (!rootId) {
      console.log(`${colors.yellow}Root folder not found, skipping sample files${colors.reset}`);
      return;
    }

    // Create a sample README in the root
    try {
      const readmeContent = `# RevPal Google Drive Repository

## Overview
This Drive folder structure supports the RevPal Agent System for ClaudeSFDC and ClaudeHubSpot.

## Folder Structure
- **Documentation**: Project documentation and guides
- **Reports**: Exported reports and dashboards
- **Templates**: Reusable templates for various platforms
- **Compliance**: Compliance and regulatory documents
- **Archives**: Historical data and archived reports

## Usage
These folders are integrated with Claude Code agents for automated access and management.

Created: ${new Date().toISOString()}
`;

      const file = await this.drive.files.create({
        resource: {
          name: 'README.md',
          parents: [rootId],
          mimeType: 'application/vnd.google-apps.document'
        },
        media: {
          mimeType: 'text/plain',
          body: readmeContent
        },
        fields: 'id, name'
      });

      console.log(`${colors.green}  ✓ Created sample README.md${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}  ✗ Failed to create sample file:${colors.reset}`, error.message);
    }
  }

  async shareFolder() {
    const rootId = this.createdFolders.get('root');
    if (!rootId) {
      console.log(`${colors.yellow}Skipping sharing configuration${colors.reset}`);
      return;
    }

    console.log(`\n${colors.blue}🔗 Share Settings:${colors.reset}`);
    console.log(`  The RevPal folder has been created with default permissions.`);
    console.log(`  To share with your team:`);
    console.log(`  1. Open Google Drive`);
    console.log(`  2. Right-click the RevPal folder`);
    console.log(`  3. Select "Share" and add team members`);
  }

  async run() {
    console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}`);
    console.log(`${colors.blue}🚀 Google Drive Folder Setup for RevPal${colors.reset}`);
    console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}\n`);

    // Authenticate
    if (!await this.authenticate()) {
      process.exit(1);
    }

    // Create folder structure
    console.log(`\n${colors.blue}📁 Creating folder structure...${colors.reset}`);
    await this.createFolderStructure(FOLDER_STRUCTURE);

    // Create sample files
    await this.createSampleFiles();

    // Share settings
    await this.shareFolder();

    // Summary
    console.log(`\n${colors.green}${'='.repeat(50)}${colors.reset}`);
    console.log(`${colors.green}✅ Setup Complete!${colors.reset}`);
    console.log(`${colors.green}${'='.repeat(50)}${colors.reset}\n`);
    
    console.log(`Next steps:`);
    console.log(`1. Open Google Drive and verify the folder structure`);
    console.log(`2. Test with Claude: "List my RevPal folders in Drive"`);
    console.log(`3. Try exporting a report: "Export a test report to Google Sheets"`);
    console.log(`\nFor more information, see: documentation/GOOGLE_DRIVE_INTEGRATION.md`);
  }
}

// Run the setup
const setup = new DriveSetup();
setup.run().catch(error => {
  console.error(`${colors.red}Setup failed:${colors.reset}`, error);
  process.exit(1);
});