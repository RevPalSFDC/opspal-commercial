#!/usr/bin/env node

const { google } = require('googleapis');
const fs = require('fs').promises;

async function listDriveFolders() {
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
    
    oauth2Client.setCredentials(token);
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    console.log('📁 Your Google Drive Folders:\n');
    console.log('================================\n');
    
    // List all folders
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name, parents)',
      orderBy: 'name',
      pageSize: 100
    });
    
    const folders = response.data.files || [];
    
    // Look for RevPal folder specifically
    const revpalFolder = folders.find(f => f.name === 'RevPal');
    
    if (revpalFolder) {
      console.log('✅ RevPal folder found!\n');
      
      // List RevPal subfolders
      const subResponse = await drive.files.list({
        q: `'${revpalFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        orderBy: 'name'
      });
      
      const subfolders = subResponse.data.files || [];
      
      console.log('📂 RevPal/');
      for (const subfolder of subfolders) {
        console.log(`  ├── ${subfolder.name}/`);
        
        // Get sub-subfolders
        const subSubResponse = await drive.files.list({
          q: `'${subfolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(name)',
          orderBy: 'name'
        });
        
        const subSubfolders = subSubResponse.data.files || [];
        for (let i = 0; i < subSubfolders.length; i++) {
          const prefix = i === subSubfolders.length - 1 ? '└──' : '├──';
          console.log(`  │   ${prefix} ${subSubfolders[i].name}/`);
        }
      }
    } else {
      console.log('⚠️  RevPal folder not found\n');
      console.log('Other folders in your Drive:');
      
      // List all folders alphabetically
      const sortedFolders = folders.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 30);
      sortedFolders.forEach(folder => {
        console.log(`  • ${folder.name}/`);
      });
      
      if (folders.length > 30) {
        console.log(`  ... and ${folders.length - 30} more folders`);
      }
    }
    
    console.log('\n================================\n');
    console.log('Total folders found:', folders.length);
    
  } catch (error) {
    console.error('Error accessing Google Drive:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.log('\n⚠️  Authentication expired. Please re-authenticate:');
      console.log('Run: npx @modelcontextprotocol/server-gdrive auth');
    }
  }
}

listDriveFolders();