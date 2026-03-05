#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TEMPLATE_ID = '1VUGRtUbqwz-UIc9J2pDXp3PQllFdv9K27cHPrM-urhc';

async function main() {
  console.log('🔍 Testing New Template Access\n');

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

  // Test Slides API access
  console.log('Checking Slides API access...');
  try {
    const presentation = await slides.presentations.get({
      presentationId: TEMPLATE_ID
    });
    console.log('✓ Template accessible!');
    console.log(`  Title: ${presentation.data.title}`);
    console.log(`  Slides: ${presentation.data.slides ? presentation.data.slides.length : 0}`);
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
    return;
  }

  // Test Drive API copy
  console.log('\nTesting template cloning...');
  try {
    const copy = await drive.files.copy({
      fileId: TEMPLATE_ID,
      requestBody: {
        name: 'Test Copy - New Template'
      }
    });
    console.log('✓ Clone successful!');
    console.log(`  New ID: ${copy.data.id}`);
    console.log(`  URL: https://docs.google.com/presentation/d/${copy.data.id}`);

    // Clean up
    await drive.files.delete({ fileId: copy.data.id });
    console.log('✓ Test copy deleted');
    console.log('\n🎉 This template works! We can use it for the sales proposal.');
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
