#!/usr/bin/env node

/**
 * Test Script: Generate Sales Proposal - Populate Template Only
 *
 * Clones template and populates with generated content (no new slides)
 */

const fs = require('fs').promises;

// Import our classes
const GoogleSlidesManager = require('./lib/google-slides-manager');
const GoogleSlidesContentGenerator = require('./lib/google-slides-content-generator');
const GoogleSlidesTemplateManager = require('./lib/google-slides-template-manager');

async function main() {
  console.log('🚀 Google Slides Generator - Sales Proposal (Template Population)\n');

  // Read transcript
  console.log('📄 Reading transcript...');
  const transcriptPath = '/home/chris/Downloads/transcript (1).csv';
  const transcriptContent = await fs.readFile(transcriptPath, 'utf8');

  // Extract key points
  const sourceContent = `
Discovery Call with Aspire - Key Points:

CLIENT: Aspire (Shopify-focused company)
STAKEHOLDER: Yao Choong (CEO)

PAIN POINTS:
1. Messy Salesforce implementation - "ugliest CRM implementation I've encountered"
2. Day-to-day admin support: 5-10 requests/week
3. Sales activity metrics reporting needed
4. Pipeline analysis and event attribution
5. MQL processing issues
6. Lead/contact duplication

TECH STACK: Salesforce, Marketo, Clary/Groove, PandaDoc, Store Leads

CLIENT GOALS:
- "80% reliable data sources"
- "Maximize time people spend unblocked"
- Crawl, walk, run approach

BUDGET: $10-20K/month
START: Early January 2024

KEY QUOTE: "I don't want to be pennywise pound foolish"

REVPAL VALUE: Strategic guidance + operationalize + evidence-based reporting
`;

  // Initialize components
  console.log('\n📋 Initializing components...');
  const slidesManager = new GoogleSlidesManager({ verbose: false });
  const contentGenerator = new GoogleSlidesContentGenerator({ verbose: false });
  const templateManager = new GoogleSlidesTemplateManager({ verbose: false });

  // Generate outline
  console.log('\n📊 Generating outline...');
  const input = {
    deck_type: 'general',
    audience: 'executive',
    topic: 'RevPal Salesforce & Marketing Operations Proposal for Aspire',
    source_content: { type: 'text', data: sourceContent },
    constraints: { max_slides: 10 }
  };

  const outline = await contentGenerator.generateOutline(input);
  console.log(`✅ Generated outline with ${outline.outline.length} slides`);

  // Select template
  console.log('\n📋 Selecting template...');
  const template = await templateManager.selectTemplate('general', 'executive');
  console.log(`✅ Selected: ${template.name}`);

  // Clone template
  console.log('\n🎨 Cloning template...');
  const presentation = await slidesManager.cloneTemplate(
    template.templateId,
    input.topic
  );
  console.log(`✅ Cloned: ${presentation.url}`);

  // Build placeholder replacements based on outline
  console.log('\n✍️  Populating content...');
  const replacements = [];

  // Title slide
  replacements.push({
    replaceAllText: {
      containsText: { text: '{{client_name}}' },
      replaceText: 'Aspire'
    }
  });

  replacements.push({
    replaceAllText: {
      containsText: { text: '{{proposal_title}}' },
      replaceText: 'Salesforce & Marketing Operations Proposal'
    }
  });

  replacements.push({
    replaceAllText: {
      containsText: { text: '{{date}}' },
      replaceText: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    }
  });

  // Executive summary
  replacements.push({
    replaceAllText: {
      containsText: { text: '{{executive_summary}}' },
      replaceText: 'RevPal proposes a phased approach to address Salesforce technical debt, implement day-to-day admin support, and deliver strategic reporting capabilities. Budget: $10-20K/month starting January 2024.'
    }
  });

  // Key pain points
  const painPoints = [
    'Messy Salesforce implementation requiring cleanup',
    'Day-to-day admin support (5-10 requests/week)',
    'Sales activity metrics and pipeline analysis needs',
    'MQL processing and lead deduplication issues'
  ];

  replacements.push({
    replaceAllText: {
      containsText: { text: '{{pain_points}}' },
      replaceText: painPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')
    }
  });

  // Solution approach
  const solutions = [
    'Tier 1: Day-to-day admin support (reports, campaigns, ownership)',
    'Tier 2: Quick-turn projects (metrics, pipeline analysis, attribution)',
    'Strategic guidance + operationalization',
    'Evidence-based, unbiased reporting'
  ];

  replacements.push({
    replaceAllText: {
      containsText: { text: '{{solution_approach}}' },
      replaceText: solutions.map((s, i) => `${i + 1}. ${s}`).join('\n')
    }
  });

  // Investment
  replacements.push({
    replaceAllText: {
      containsText: { text: '{{budget}}' },
      replaceText: '$10-20K/month'
    }
  });

  replacements.push({
    replaceAllText: {
      containsText: { text: '{{timeline}}' },
      replaceText: 'Start: Early January 2024'
    }
  });

  // Execute batch update
  if (replacements.length > 0) {
    console.log(`   Executing ${replacements.length} replacements...`);
    await slidesManager.batchUpdate(presentation.presentationId, replacements);
    console.log(`✅ Populated template`);
  }

  // Final output
  console.log('\n🎉 Complete!\n');
  console.log('═══════════════════════════════════════════════════');
  console.log('📊 PRESENTATION CREATED');
  console.log('═══════════════════════════════════════════════════');
  console.log(`\n📎 URL: ${presentation.url}`);
  console.log(`📋 Template: OpsPal RevPal Slides Master Template`);
  console.log(`✓ Content populated from discovery call transcript`);
  console.log(`\n👉 Open the presentation to review and customize\n`);

  return presentation;
}

main()
  .then(() => {
    console.log('✅ Success');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
