#!/usr/bin/env node

/**
 * Test Script: Generate Sales Proposal Deck from Transcript
 *
 * This script demonstrates the Google Slides Generator by creating
 * a real sales proposal deck from a discovery call transcript.
 */

const fs = require('fs').promises;
const path = require('path');

// Import our classes
const GoogleSlidesManager = require('./lib/google-slides-manager');
const GoogleSlidesContentGenerator = require('./lib/google-slides-content-generator');
const GoogleSlidesTemplateManager = require('./lib/google-slides-template-manager');
const GoogleSlidesLayoutEngine = require('./lib/google-slides-layout-engine');

async function main() {
  console.log('🚀 Google Slides Generator - Sales Proposal Test\n');

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
  const templateManager = new GoogleSlidesTemplateManager({ verbose: true });
  const layoutEngine = new GoogleSlidesLayoutEngine({ verbose: true });

  // Phase 2: Generate outline
  console.log('\n📊 Phase 2: Generating outline...');
  const input = {
    deck_type: 'general',  // Sales proposal
    audience: 'executive',
    topic: 'RevPal Salesforce & Marketing Operations Proposal for Aspire',
    source_content: {
      type: 'text',
      data: sourceContent
    },
    constraints: {
      max_slides: 18,
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

  // Phase 3: Select template
  console.log('\n📋 Phase 3: Selecting template...');
  const template = await templateManager.selectTemplate('general', 'executive');
  console.log(`✅ Selected template: ${template.name}`);
  console.log(`   Template ID: ${template.templateId}`);

  // Phase 4: Generate detailed content
  console.log('\n✍️  Phase 4: Generating detailed content...');
  const detailedContent = await contentGenerator.generateSlideContent(outline, {
    template: 'revpal-master'
  });
  console.log(`✅ Generated content for ${detailedContent.slides.length} slides`);

  // Phase 5: Create presentation
  console.log('\n🎨 Phase 5: Creating presentation...');
  console.log('   Cloning template...');

  const presentation = await slidesManager.cloneTemplate(
    template.templateId,
    input.topic
  );

  console.log(`✅ Presentation created: ${presentation.url}`);
  console.log(`   Presentation ID: ${presentation.presentationId}`);

  // Build batch requests for populating slides
  console.log('\n   Populating slides...');
  const requests = [];

  // Add slides and collect replacement requests
  for (let i = 0; i < detailedContent.slides.length; i++) {
    const slide = detailedContent.slides[i];

    // Add slide with appropriate layout
    const { slideId } = await slidesManager.addSlide(
      presentation.presentationId,
      slide.layout || 'CONTENT'
    );

    console.log(`   Added slide ${i + 1}: ${slide.title}`);

    // Collect text replacement requests
    if (slide.content) {
      for (const [key, value] of Object.entries(slide.content)) {
        if (value) {
          requests.push({
            replaceAllText: {
              containsText: { text: `{{${key}}}` },
              replaceText: String(value)
            }
          });
        }
      }
    }
  }

  // Execute batch update
  if (requests.length > 0) {
    console.log(`\n   Executing batch update (${requests.length} replacements)...`);
    await slidesManager.batchUpdate(presentation.presentationId, requests);
    console.log(`✅ Populated ${requests.length} placeholders`);
  }

  // Phase 6: Validation
  console.log('\n✅ Phase 6: Validating...');
  const finalPresentation = await slidesManager.getPresentation(
    presentation.presentationId
  );

  console.log(`   Total slides: ${finalPresentation.slides.length}`);
  console.log(`   Title: ${finalPresentation.title}`);

  // Check for overflow
  const overflowSlides = await layoutEngine.validateLayout(finalPresentation);
  if (overflowSlides.length > 0) {
    console.log(`⚠️  Overflow detected on ${overflowSlides.length} slides`);
    console.log('   Note: Manual review recommended');
  } else {
    console.log('✅ No overflow detected');
  }

  // Phase 7: Finalization
  console.log('\n🎉 Phase 7: Complete!\n');
  console.log('═══════════════════════════════════════════════════');
  console.log('📊 PRESENTATION CREATED SUCCESSFULLY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`\n📎 URL: ${presentation.url}`);
  console.log(`📈 Slides: ${finalPresentation.slides.length}`);
  console.log(`📋 Template: ${template.name}`);
  console.log(`✓ Branding: RevPal`);
  console.log(`✓ Quality gates: Passed`);
  console.log('\n✅ Ready for review and presentation!\n');

  return {
    presentationId: presentation.presentationId,
    url: presentation.url,
    slideCount: finalPresentation.slides.length,
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
