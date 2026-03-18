#!/usr/bin/env node

/**
 * Google Slides Authorization Helper
 *
 * Interactive script to complete OAuth2 flow and save token
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive'  // Full Drive access to read existing files
];

const CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                         path.join(process.env.HOME, '.credentials', 'google-credentials.json');
const TOKEN_PATH = path.join(process.env.HOME, '.credentials', 'google-token.json');

async function main() {
  console.log('🔐 Google Slides OAuth2 Authorization\n');

  // Load credentials
  console.log('📄 Loading credentials...');
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`❌ Credentials not found at: ${CREDENTIALS_PATH}`);
    console.error('   Run setup first: see docs/GOOGLE_SLIDES_SETUP.md');
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  console.log(`✓ Credentials loaded`);
  console.log(`  Client ID: ${client_id}\n`);

  // Create OAuth2 client
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if token already exists
  if (fs.existsSync(TOKEN_PATH)) {
    console.log('✓ Token already exists at:', TOKEN_PATH);
    console.log('  To re-authorize, delete this file and run again.\n');

    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);

    // Test the token
    console.log('🧪 Testing token...');
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    try {
      const res = await drive.about.get({ fields: 'user' });
      console.log(`✓ Token valid! Authenticated as: ${res.data.user.emailAddress}\n`);
      console.log('✅ Authorization complete! You can now use the Google Slides Generator.\n');
      process.exit(0);
    } catch (error) {
      console.log(`⚠️  Token expired or invalid. Re-authorizing...\n`);
      fs.unlinkSync(TOKEN_PATH);
    }
  }

  // Generate authorization URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('📋 STEP 1: Authorize this app');
  console.log('   Copy and paste this URL into your browser:\n');
  console.log('   ' + authUrl + '\n');
  console.log('📋 STEP 2: Sign in and authorize');
  console.log('   - Sign in with your Google account');
  console.log('   - Click "Allow" to grant permissions');
  console.log('   - You\'ll see an authorization code\n');

  // Prompt for authorization code
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await new Promise((resolve) => {
    rl.question('📋 STEP 3: Enter the authorization code: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  console.log('\n🔄 Exchanging authorization code for token...');

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Save token
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    fs.chmodSync(TOKEN_PATH, 0o600);

    console.log(`✓ Token saved to: ${TOKEN_PATH}\n`);

    // Test the token
    console.log('🧪 Testing token...');
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    const res = await drive.about.get({ fields: 'user' });
    console.log(`✓ Token valid! Authenticated as: ${res.data.user.emailAddress}\n`);

    console.log('✅ Authorization complete! You can now use the Google Slides Generator.\n');
    console.log('Next steps:');
    console.log('  1. Run the test: node scripts/test-slides-generation.js');
    console.log('  2. Or use the google-slides-generator agent\n');

  } catch (error) {
    console.error('\n❌ Authorization failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  - Make sure you copied the full authorization code');
    console.error('  - Try generating a new URL and authorizing again');
    console.error('  - Check that APIs are enabled in Google Cloud Console\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
