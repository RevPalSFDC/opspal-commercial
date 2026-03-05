#!/usr/bin/env node

/**
 * Simple Google Slides Test - Create Blank Presentation
 *
 * Tests Google Slides API by creating a blank presentation
 */

const GoogleSlidesManager = require('./lib/google-slides-manager');

async function main() {
  console.log('🚀 Google Slides API Test - Create Blank Presentation\n');

  // Initialize manager
  console.log('📋 Initializing Google Slides Manager...');
  const slidesManager = new GoogleSlidesManager({ verbose: true });

  // Create blank presentation
  console.log('\n🎨 Creating blank presentation...');
  const presentation = await slidesManager.createBlankPresentation(
    'RevPal Test Presentation - Sales Proposal Demo'
  );

  console.log(`\n✅ Success!`);
  console.log(`━`.repeat(70));
  console.log(`📊 Presentation Created:`);
  console.log(`   ID: ${presentation.presentationId}`);
  console.log(`   URL: ${presentation.url}`);
  console.log(`   Title: ${presentation.title}`);
  console.log(`━`.repeat(70));

  // Test adding a slide
  console.log(`\n📄 Adding title slide...`);
  const titleSlide = await slidesManager.addSlide(
    presentation.presentationId,
    'TITLE'
  );
  console.log(`✓ Title slide added: ${titleSlide.slideId}`);

  // Test text replacement
  console.log(`\n✍️  Adding content...`);
  await slidesManager.replaceText(
    presentation.presentationId,
    'Title',
    'RevPal Salesforce & Marketing Operations'
  );
  await slidesManager.replaceText(
    presentation.presentationId,
    'Subtitle',
    'Proposal for Aspire'
  );
  console.log(`✓ Content added`);

  console.log(`\n✅ Test Complete!`);
  console.log(`\nView your presentation: ${presentation.url}\n`);

  return presentation;
}

main()
  .then(() => {
    console.log('✓ All tests passed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
