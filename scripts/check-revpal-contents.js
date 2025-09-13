#!/usr/bin/env node

const { google } = require('googleapis');
const fs = require('fs').promises;

async function checkRevPalContents() {
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
    
    console.log('🔍 Checking RevPal Folder Contents\n');
    console.log('================================\n');
    
    // Find RevPal folder
    const revpalSearch = await drive.files.list({
      q: "name='RevPal' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)',
      pageSize: 1
    });
    
    if (revpalSearch.data.files && revpalSearch.data.files.length > 0) {
      const revpalFolder = revpalSearch.data.files[0];
      console.log(`✅ Found RevPal folder (ID: ${revpalFolder.id})\n`);
      
      // List contents of RevPal folder
      const contents = await drive.files.list({
        q: `'${revpalFolder.id}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, modifiedTime)',
        orderBy: 'name'
      });
      
      if (contents.data.files && contents.data.files.length > 0) {
        console.log('📂 Current contents:');
        contents.data.files.forEach(file => {
          const icon = file.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
          const type = file.mimeType === 'application/vnd.google-apps.folder' ? 'Folder' : 'File';
          console.log(`  ${icon} ${file.name} (${type})`);
        });
        console.log(`\nTotal items: ${contents.data.files.length}`);
      } else {
        console.log('📂 RevPal folder is empty');
      }
      
      // Check which subfolders need to be created
      console.log('\n📋 Required subfolders status:');
      const requiredFolders = ['Documentation', 'Reports', 'Templates', 'Compliance', 'Archives'];
      const existingFolders = contents.data.files
        ?.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
        .map(f => f.name) || [];
      
      for (const folder of requiredFolders) {
        if (existingFolders.includes(folder)) {
          console.log(`  ✅ ${folder}/ - exists`);
        } else {
          console.log(`  ⚠️  ${folder}/ - needs to be created`);
        }
      }
      
      return revpalFolder.id;
    } else {
      console.log('❌ RevPal folder not found');
      console.log('\nThe folder needs to be created first.');
      return null;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkRevPalContents().then(folderId => {
  if (folderId) {
    console.log('\n================================\n');
    console.log('📝 Next Steps:');
    console.log('1. Re-authenticate with full permissions:');
    console.log('   npx @modelcontextprotocol/server-gdrive auth --reset');
    console.log('\n2. Or manually create the missing subfolders in Google Drive');
    console.log('\n3. Then test with:');
    console.log('   "Export a test report to RevPal/Reports"');
  }
});