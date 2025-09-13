#!/usr/bin/env node

const { google } = require('googleapis');
const fs = require('fs').promises;

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
        'Monthly': {}
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
        'Flows': {}
      },
      'HubSpot': {
        'Workflows': {},
        'Emails': {},
        'Forms': {}
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
      '2025': {}
    }
  }
};

async function createFolders() {
  try {
    // Load saved credentials
    const tokenPath = '/home/chris/.nvm/versions/node/v22.15.1/lib/node_modules/.gdrive-server-credentials.json';
    const token = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
    
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      '872687318200-3ecmo321lucq83pl730iivrmbalq9spp.apps.googleusercontent.com',
      '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',
      'http://localhost:3000/oauth/callback'
    );
    
    // Use the full credentials including access token
    oauth2Client.setCredentials(token);
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    console.log('🚀 Creating RevPal Folder Structure\n');
    console.log('================================\n');
    
    // Helper function to create a folder
    async function createFolder(name, parentId = null) {
      try {
        // Check if folder exists
        let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        if (parentId) {
          query += ` and '${parentId}' in parents`;
        }
        
        const existing = await drive.files.list({
          q: query,
          fields: 'files(id, name)',
          pageSize: 1
        });
        
        if (existing.data.files && existing.data.files.length > 0) {
          console.log(`  ✓ Exists: ${name}`);
          return existing.data.files[0].id;
        }
        
        // Create new folder
        const fileMetadata = {
          name: name,
          mimeType: 'application/vnd.google-apps.folder'
        };
        if (parentId) {
          fileMetadata.parents = [parentId];
        }
        
        const folder = await drive.files.create({
          resource: fileMetadata,
          fields: 'id, name'
        });
        
        console.log(`  ✅ Created: ${name}`);
        return folder.data.id;
      } catch (error) {
        console.log(`  ❌ Error creating ${name}: ${error.message}`);
        return null;
      }
    }
    
    // Recursive function to create structure
    async function createStructure(structure, parentId = null, level = 0) {
      const indent = '  '.repeat(level);
      for (const [name, children] of Object.entries(structure)) {
        console.log(`${indent}📁 ${name}/`);
        const folderId = await createFolder(name, parentId);
        if (folderId && Object.keys(children).length > 0) {
          await createStructure(children, folderId, level + 1);
        }
      }
    }
    
    // Create the structure
    await createStructure(FOLDER_STRUCTURE);
    
    console.log('\n================================\n');
    console.log('✅ Folder structure created successfully!');
    console.log('\nYou can now:');
    console.log('  • Access documents with: "Get documents from RevPal/Documentation"');
    console.log('  • Export reports to: "Export to RevPal/Reports/Salesforce"');
    console.log('  • Save templates to: "Save template in RevPal/Templates"');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('insufficient authentication scopes')) {
      console.log('\n⚠️  Need to re-authenticate with proper scopes.');
      console.log('Run: npx @modelcontextprotocol/server-gdrive auth --reset');
    }
  }
}

createFolders();