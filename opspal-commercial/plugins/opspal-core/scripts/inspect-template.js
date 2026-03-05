#!/usr/bin/env node

/**
 * Inspect Template Structure
 *
 * Examines the template to find actual placeholders and slide structure
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TEMPLATE_ID = '1VUGRtUbqwz-UIc9J2pDXp3PQllFdv9K27cHPrM-urhc';

async function main() {
  console.log('🔍 Inspecting Template Structure\n');

  // Load credentials
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

  const slides = google.slides({ version: 'v1', auth: oAuth2Client });

  // Get presentation
  const presentation = await slides.presentations.get({
    presentationId: TEMPLATE_ID
  });

  console.log(`Title: ${presentation.data.title}`);
  console.log(`Total Slides: ${presentation.data.slides.length}\n`);
  console.log('═'.repeat(70));

  // Examine first 10 slides
  for (let i = 0; i < Math.min(10, presentation.data.slides.length); i++) {
    const slide = presentation.data.slides[i];
    console.log(`\nSlide ${i + 1}:`);
    console.log(`  Object ID: ${slide.objectId}`);

    // Extract all text from page elements
    if (slide.pageElements) {
      const textElements = slide.pageElements.filter(el => el.shape?.text);

      if (textElements.length > 0) {
        console.log(`  Text Elements: ${textElements.length}`);

        textElements.forEach((el, idx) => {
          const text = el.shape.text.textElements
            .map(te => te.textRun?.content || '')
            .join('')
            .trim();

          if (text) {
            console.log(`    [${idx + 1}] ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
          }
        });
      } else {
        console.log(`  No text elements`);
      }
    }
  }

  console.log('\n═'.repeat(70));
  console.log('\nTo populate this template, we need to either:');
  console.log('1. Find matching placeholders (like {{text}}) and replace them');
  console.log('2. Or create new text boxes with our content');
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
