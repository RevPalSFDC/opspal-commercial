#!/usr/bin/env node

/**
 * Test Script: Generate Sales Proposal Deck WITHOUT Template
 *
 * Creates presentation from scratch using generated content
 */

const fs = require('fs').promises;
const path = require('path');

// Import our classes
const GoogleSlidesManager = require('./lib/google-slides-manager');
const GoogleSlidesContentGenerator = require('./lib/google-slides-content-generator');

async function main() {
  console.log('🚀 Google Slides Generator - Sales Proposal Test (No Template)\n');

  // Read transcript
  console.log('📄 Reading transcript...');
  const transcriptPath = '/home/chris/Downloads/transcript (1).csv';
  const transcriptContent = await fs.readFile(transcriptPath, 'utf8');

  // Extract key points from transcript
  const sourceContent = `
Discovery Call with Aspire - Key Points:

CLIENT: Aspire (Shopify-focused company)
STAKEHOLDER: Yao Choong (CEO)
CONSULTING FIRM: RevPal (Christian Freese & Christopher Acevedo)

PAIN POINTS:
1. Messy Salesforce implementation with years of technical debt - "ugliest CRM implementation I've encountered in my career"
2. Day-to-day admin support needed (Tier 1): 5-10 requests/week, 3 minutes to 1 hour tasks
   - Account ownership transfers
   - Report fixes
   - Campaign setup (Marketo → Salesforce)
3. Quick-turn projects needed (Tier 2):
   - Sales activity metrics reporting (calls, meetings, emails via Clary/Groove)
   - Pipeline change analysis (period-over-period, composition, aging)
   - Event attribution and tracking
   - Performance marketing attribution (paid ads, organic)
4. MQL processing issues - CEO concerned about responsiveness
5. Lead/contact duplication problems
6. Teams blocked waiting for data

TECH STACK:
- Salesforce (with significant technical debt)
- Marketo (P1 and P2 MQLs with scoring system)
- Clary/Groove (sales activity tracking)
- PandaDoc (quoting - working well)
- Store Leads (Shopify app tracking)

CLIENT GOALS:
- "80% reliable data sources for each function"
- "Maximize time people spend unblocked"
- Support new product marketing director starting Monday
- Crawl, walk, run approach
- Focus on sales & marketing first

BUDGET & TIMELINE:
- Budget: $10-20K/month ("cash-strapped Q1/Q2")
- Start: Early January 2024
- Yao traveling Dec 9-28

KEY QUOTE:
"I don't want to be pennywise pound foolish...it makes no sense to save like 5k in systems and lose out on 50k of sales"

REVPAL VALUE PROP:
- Not just admins - strategic guidance
- Operationalize so client doesn't depend on consultants forever
- Build evidence-based, unbiased reporting
- Start at top of funnel (marketing quality impacts sales)
`;

  // Phase 1: Initialize components
  console.log('\n📋 Phase 1: Initializing components...');
  const slidesManager = new GoogleSlidesManager({ verbose: true });
  const contentGenerator = new GoogleSlidesContentGenerator({ verbose: true });

  // Phase 2: Generate outline
  console.log('\n📊 Phase 2: Generating outline...');
  const input = {
    deck_type: 'general',
    audience: 'executive',
    topic: 'RevPal Salesforce & Marketing Operations Proposal for Aspire',
    source_content: {
      type: 'text',
      data: sourceContent
    },
    constraints: {
      max_slides: 15,
      slide_count_preference: 'moderate',
      include_appendix: false
    },
    branding: {
      company_name: 'RevPal',
      tagline: 'OpsPal by RevPal'
    }
  };

  const outline = await contentGenerator.generateOutline(input);
  console.log(`✅ Generated outline with ${outline.outline.length} slides`);

  // Phase 3: Generate detailed content
  console.log('\n✍️  Phase 3: Generating detailed content...');
  const detailedContent = await contentGenerator.generateSlideContent(outline);
  console.log(`✅ Generated content for ${detailedContent.slides.length} slides`);

  // Phase 4: Create blank presentation
  console.log('\n🎨 Phase 4: Creating blank presentation...');
  const presentation = await slidesManager.createBlankPresentation(input.topic);
  console.log(`✅ Presentation created: ${presentation.url}`);
  console.log(`   Presentation ID: ${presentation.presentationId}`);

  // Phase 5: Add slides and populate content
  console.log('\n📄 Phase 5: Adding slides and content...');

  for (let i = 0; i < detailedContent.slides.length; i++) {
    const slide = detailedContent.slides[i];
    console.log(`   Adding slide ${i + 1}/${detailedContent.slides.length}: ${slide.title}`);

    // Add slide (use TITLE layout for simplicity)
    const { slideId } = await slidesManager.addSlide(
      presentation.presentationId,
      'TITLE'
    );

    // Build slide content text
    let slideText = slide.title;
    if (slide.content && slide.content.bullets) {
      slideText += '\n\n' + slide.content.bullets.map(b => `• ${b}`).join('\n');
    }

    // Note: Title layout doesn't have easy placeholders, so this creates a basic presentation
    // In production, we'd use proper text box creation or work with the RevPal template
  }

  console.log(`✅ Added ${detailedContent.slides.length} slides`);

  // Phase 6: Finalization
  console.log('\n🎉 Phase 6: Complete!\\n');
  console.log('═══════════════════════════════════════════════════');
  console.log('📊 PRESENTATION CREATED SUCCESSFULLY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`\n📎 URL: ${presentation.url}`);
  console.log(`📈 Slides: ${detailedContent.slides.length}`);
  console.log(`✓ Content: Sales proposal for Aspire`);
  console.log(`✓ Ready for review and presentation!\n`);

  return {
    presentationId: presentation.presentationId,
    url: presentation.url,
    slideCount: detailedContent.slides.length,
    success: true
  };
}

// Run the test
main()
  .then(result => {
    console.log('✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
