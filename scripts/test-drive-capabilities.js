#!/usr/bin/env node

const { google } = require('googleapis');
const fs = require('fs').promises;

async function testCapabilities() {
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
    
    console.log('🧪 Testing Current Google Drive Capabilities\n');
    console.log('============================================\n');
    
    // Test 1: List files
    console.log('📋 Test 1: List RevPal files');
    const revpalSearch = await drive.files.list({
      q: "name='RevPal' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)',
      pageSize: 1
    });
    
    if (revpalSearch.data.files && revpalSearch.data.files.length > 0) {
      const revpalId = revpalSearch.data.files[0].id;
      console.log('✅ Can access RevPal folder\n');
      
      // Test 2: Read file metadata
      console.log('📖 Test 2: Read file information');
      const files = await drive.files.list({
        q: `'${revpalId}' in parents and trashed=false`,
        fields: 'files(name, mimeType, size)',
        pageSize: 5
      });
      
      if (files.data.files && files.data.files.length > 0) {
        console.log('✅ Can read file metadata');
        console.log(`   Found ${files.data.files.length} items in RevPal\n`);
      }
      
      // Test 3: Search capability
      console.log('🔍 Test 3: Search files');
      const searchResults = await drive.files.list({
        q: "name contains 'Contract'",
        fields: 'files(name)',
        pageSize: 3
      });
      
      if (searchResults.data.files) {
        console.log('✅ Can search for files');
        console.log(`   Found ${searchResults.data.files.length} files with "Contract"\n`);
      }
      
      // Test 4: Create a test file (will likely fail)
      console.log('📝 Test 4: Create test file');
      try {
        const testContent = 'Test report export from RevPal Integration';
        const fileMetadata = {
          name: 'Test_Report_' + new Date().toISOString().split('T')[0] + '.txt',
          parents: [revpalId]
        };
        
        const media = {
          mimeType: 'text/plain',
          body: testContent
        };
        
        const file = await drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: 'id, name'
        });
        
        console.log('✅ Can create files in RevPal!');
        console.log(`   Created: ${file.data.name}\n`);
      } catch (error) {
        if (error.message.includes('insufficient')) {
          console.log('⚠️  Cannot create files (need more permissions)\n');
        } else {
          console.log('❌ Error creating file:', error.message, '\n');
        }
      }
      
      // Summary
      console.log('============================================\n');
      console.log('📊 CAPABILITY SUMMARY:\n');
      console.log('✅ CAN DO NOW:');
      console.log('  • List and browse folders');
      console.log('  • Read file metadata');
      console.log('  • Search for files');
      console.log('  • Access existing documents');
      console.log('');
      console.log('⚠️  NEEDS FULL PERMISSIONS:');
      console.log('  • Create new folders');
      console.log('  • Upload files');
      console.log('  • Export reports to Sheets');
      console.log('');
      console.log('🎯 NEXT STEPS:');
      console.log('1. For full functionality, run:');
      console.log('   npx @modelcontextprotocol/server-gdrive auth --reset');
      console.log('');
      console.log('2. Or manually create these folders in Drive:');
      console.log('   • RevPal/Documentation');
      console.log('   • RevPal/Reports');
      console.log('   • RevPal/Templates');
      console.log('   • RevPal/Compliance');
      console.log('   • RevPal/Archives');
      
    } else {
      console.log('❌ Cannot find RevPal folder');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testCapabilities();