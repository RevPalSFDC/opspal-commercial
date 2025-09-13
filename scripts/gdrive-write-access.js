#!/usr/bin/env node

/**
 * Google Drive Write Access Implementation
 * Uses OAuth2 with full Drive scope for write permissions
 */

const { google } = require('googleapis');
const fs = require('fs').promises;
const readline = require('readline');
const path = require('path');

class GoogleDriveWriter {
  constructor() {
    this.SCOPES = ['https://www.googleapis.com/auth/drive']; // Full Drive access
    this.TOKEN_PATH = path.join(process.env.HOME, '.credentials', 'gdrive-write-token.json');
    this.drive = null;
  }

  async authorize() {
    console.log('🔑 Setting up Google Drive with WRITE access...\n');
    
    const oAuth2Client = new google.auth.OAuth2(
      '872687318200-3ecmo321lucq83pl730iivrmbalq9spp.apps.googleusercontent.com',
      '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',
      'urn:ietf:wg:oauth:2.0:oob' // Use OOB flow for better control
    );

    try {
      // Try to load existing token
      const token = await fs.readFile(this.TOKEN_PATH, 'utf8');
      oAuth2Client.setCredentials(JSON.parse(token));
      
      // Test if token works
      this.drive = google.drive({ version: 'v3', auth: oAuth2Client });
      await this.drive.files.list({ pageSize: 1 });
      
      console.log('✅ Using existing credentials with write access\n');
      return oAuth2Client;
    } catch (error) {
      // Need new token
      return await this.getNewToken(oAuth2Client);
    }
  }

  async getNewToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.SCOPES,
      prompt: 'consent' // Force showing all permissions
    });

    console.log('🌐 To grant WRITE access to Google Drive:\n');
    console.log('1. Open this URL in your browser:\n');
    console.log(authUrl);
    console.log('\n2. Sign in and grant permissions');
    console.log('3. You will see a code - copy it');
    console.log('4. Paste the code here and press Enter:\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve, reject) => {
      rl.question('Enter the authorization code: ', async (code) => {
        rl.close();
        
        try {
          const { tokens } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);
          
          // Save token for future use
          await this.saveToken(tokens);
          
          this.drive = google.drive({ version: 'v3', auth: oAuth2Client });
          console.log('\n✅ Authorization successful! Write access granted.\n');
          resolve(oAuth2Client);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async saveToken(tokens) {
    try {
      await fs.mkdir(path.dirname(this.TOKEN_PATH), { recursive: true });
      await fs.writeFile(this.TOKEN_PATH, JSON.stringify(tokens));
      console.log('💾 Token saved for future use');
    } catch (error) {
      console.warn('Could not save token:', error.message);
    }
  }

  async createFolder(name, parentId = null) {
    const fileMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder'
    };
    
    if (parentId) {
      fileMetadata.parents = [parentId];
    }

    try {
      const response = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id, name'
      });
      console.log(`✅ Created folder: ${name}`);
      return response.data.id;
    } catch (error) {
      console.error(`❌ Error creating ${name}: ${error.message}`);
      return null;
    }
  }

  async findFolder(name, parentId = null) {
    let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }

    const response = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
      pageSize: 1
    });

    return response.data.files[0] || null;
  }

  async createFolderStructure() {
    console.log('📁 Creating RevPal folder structure...\n');

    // Find or create RevPal folder
    let revpalFolder = await this.findFolder('RevPal');
    if (!revpalFolder) {
      const revpalId = await this.createFolder('RevPal');
      revpalFolder = { id: revpalId };
    } else {
      console.log('📂 Found existing RevPal folder\n');
    }

    const structure = {
      'Documentation': ['Salesforce', 'HubSpot', 'Integration'],
      'Reports': {
        'Salesforce': ['Daily', 'Weekly', 'Monthly'],
        'HubSpot': ['Marketing', 'Sales', 'Service'],
        'Combined': ['Executive', 'Operational']
      },
      'Templates': {
        'Salesforce': ['Apex', 'Lightning', 'Flows'],
        'HubSpot': ['Workflows', 'Emails', 'Forms'],
        'Documentation': []
      },
      'Compliance': ['GDPR', 'HIPAA', 'SOC2', 'CCPA'],
      'Archives': ['2025']
    };

    // Create main folders
    for (const [mainFolder, substructure] of Object.entries(structure)) {
      let mainFolderId = await this.findFolder(mainFolder, revpalFolder.id);
      if (!mainFolderId) {
        mainFolderId = await this.createFolder(mainFolder, revpalFolder.id);
      } else {
        console.log(`📁 ${mainFolder} already exists`);
        mainFolderId = mainFolderId.id;
      }

      // Create subfolders
      if (mainFolderId && substructure) {
        if (Array.isArray(substructure)) {
          // Simple array of subfolders
          for (const subfolder of substructure) {
            const existing = await this.findFolder(subfolder, mainFolderId);
            if (!existing) {
              await this.createFolder(subfolder, mainFolderId);
            }
          }
        } else if (typeof substructure === 'object') {
          // Nested structure
          for (const [subfolder, subsubfolders] of Object.entries(substructure)) {
            let subfolderId = await this.findFolder(subfolder, mainFolderId);
            if (!subfolderId) {
              subfolderId = await this.createFolder(subfolder, mainFolderId);
            } else {
              subfolderId = subfolderId.id;
            }
            
            // Create sub-subfolders
            if (subfolderId && Array.isArray(subsubfolders)) {
              for (const subsubfolder of subsubfolders) {
                const existing = await this.findFolder(subsubfolder, subfolderId);
                if (!existing) {
                  await this.createFolder(subsubfolder, subfolderId);
                }
              }
            }
          }
        }
      }
    }

    console.log('\n✅ Folder structure creation complete!');
  }

  async testWriteAccess() {
    console.log('\n🧪 Testing write access...\n');

    const revpalFolder = await this.findFolder('RevPal');
    if (!revpalFolder) {
      console.log('❌ RevPal folder not found');
      return false;
    }

    try {
      // Try to create a test file
      const testContent = 'This is a test file from RevPal Google Drive integration';
      const fileMetadata = {
        name: `Test_Write_${Date.now()}.txt`,
        parents: [revpalFolder.id]
      };

      const media = {
        mimeType: 'text/plain',
        body: testContent
      };

      const file = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name'
      });

      console.log(`✅ Write test successful! Created: ${file.data.name}`);
      
      // Clean up test file
      await this.drive.files.delete({ fileId: file.data.id });
      console.log('🧹 Test file cleaned up');
      
      return true;
    } catch (error) {
      console.log(`❌ Write test failed: ${error.message}`);
      return false;
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 Google Drive Write Access Setup');
  console.log('='.repeat(60));
  console.log();

  const gdrive = new GoogleDriveWriter();
  
  try {
    // Authorize with write permissions
    await gdrive.authorize();
    
    // Test write access
    const hasWriteAccess = await gdrive.testWriteAccess();
    
    if (hasWriteAccess) {
      console.log('\n✅ You have full write access to Google Drive!\n');
      
      // Create folder structure
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      rl.question('Create RevPal folder structure now? (y/n): ', async (answer) => {
        rl.close();
        
        if (answer.toLowerCase() === 'y') {
          await gdrive.createFolderStructure();
        } else {
          console.log('\nYou can run this script again to create folders later.');
        }
        
        console.log('\n='.repeat(60));
        console.log('✅ Setup complete! Google Drive write access is ready.');
        console.log('='.repeat(60));
      });
    } else {
      console.log('\n⚠️  Write access not available. Please re-authenticate.');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\nPlease try running the script again.');
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = GoogleDriveWriter;