#!/usr/bin/env node

/**
 * Test Template Access
 *
 * Verifies we can access the RevPal master template
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TEMPLATE_ID = '1iFug0S1BfOx9uW__McTPNFXOidg47wqgavhIWQltcNU';

async function main() {
  console.log('🔍 Testing Template Access\n');

  // Load credentials and token
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                          path.join(process.env.HOME, '.credentials', 'google-credentials.json');
  const tokenPath = path.join(process.env.HOME, '.credentials', 'google-token.json');

  const credentials = JSON.parse(fs.readFileSync(credentialsPath));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const token = JSON.parse(fs.readFileSync(tokenPath));
  oAuth2Client.setCredentials(token);

  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const slides = google.slides({ version: 'v1', auth: oAuth2Client });

  console.log(`Template ID: ${TEMPLATE_ID}\n`);

  // Test 1: Try to get file metadata via Drive API
  console.log('Test 1: Checking file via Drive API...');
  try {
    const file = await drive.files.get({
      fileId: TEMPLATE_ID,
      fields: 'id, name, mimeType, owners, permissions, shared'
    });
    console.log('✓ File found!');
    console.log(`  Name: ${file.data.name}`);
    console.log(`  Type: ${file.data.mimeType}`);
    console.log(`  Owner: ${file.data.owners?.[0]?.emailAddress || 'Unknown'}`);
    console.log(`  Shared: ${file.data.shared}`);
  } catch (error) {
    console.log('✗ Drive API error:', error.message);
    console.log(`  Code: ${error.code}`);
  }

  // Test 2: Try to get presentation via Slides API
  console.log('\nTest 2: Checking presentation via Slides API...');
  try {
    const presentation = await slides.presentations.get({
      presentationId: TEMPLATE_ID
    });
    console.log('✓ Presentation accessible!');
    console.log(`  Title: ${presentation.data.title}`);
    console.log(`  Slides: ${presentation.data.slides?.length || 0}`);
    console.log(`  URL: https://docs.google.com/presentation/d/${TEMPLATE_ID}`);
  } catch (error) {
    console.log('✗ Slides API error:', error.message);
    console.log(`  Code: ${error.code}`);
  }

  // Test 3: Try to copy the file
  console.log('\nTest 3: Attempting to copy...');
  try {
    const copy = await drive.files.copy({
      fileId: TEMPLATE_ID,
      requestBody: {
        name: 'Test Copy - RevPal Template'
      }
    });
    console.log('✓ Copy successful!');
    console.log(`  New ID: ${copy.data.id}`);
    console.log(`  URL: https://docs.google.com/presentation/d/${copy.data.id}`);

    // Clean up test copy
    await drive.files.delete({ fileId: copy.data.id });
    console.log('✓ Test copy deleted');
  } catch (error) {
    console.log('✗ Copy error:', error.message);
    console.log(`  Code: ${error.code}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('If you can open the template in your browser but we can\'t access it here,');
  console.log('try sharing the file with yourself (cacevedo@gorevpal.com) with "Editor" access.');
  console.log('='.repeat(70));
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
