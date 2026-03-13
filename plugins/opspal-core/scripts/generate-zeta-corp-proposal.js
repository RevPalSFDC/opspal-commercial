#!/usr/bin/env node

/**
 * Generate Sales Proposal from Discovery Call Transcript
 *
 * Parses a transcript CSV and auto-generates a proposal presentation.
 * Uses template-based slide selection to choose relevant slides based on buyer context.
 * Supports both basic keyword extraction and LLM-enhanced semantic analysis.
 *
 * Basic Usage:
 *   node generate-zeta-corp-proposal.js --transcript <file>              # New presentation
 *   node generate-zeta-corp-proposal.js --transcript <file> --id <id>    # Update existing
 *
 * Template-Based Selection:
 *   node generate-zeta-corp-proposal.js --transcript <file> --slides 10  # Target 10 slides
 *   node generate-zeta-corp-proposal.js --transcript <file> --preview-selection
 *
 * Enhanced Usage (LLM-powered):
 *   node generate-zeta-corp-proposal.js --transcript <file> --enhance    # With semantic analysis
 *   node generate-zeta-corp-proposal.js --transcript <file> --enhance --persona executive
 *   node generate-zeta-corp-proposal.js --transcript <file> --enhance --auto-apply
 *
 * Options:
 *   --slides <n>      Target number of slides (default: 10)
 *   --preview-selection  Preview slide selection without generating
 *   --enhance         Enable LLM semantic analysis and persona-based content
 *   --persona <type>  Target persona: executive, operations, technical, endUser
 *   --auto-apply      Automatically apply low-risk enhancement suggestions
 *   --review-only     Generate review without applying changes
 *   --verbose         Enable detailed logging
 */

const fs = require('fs');
const GoogleSlidesManager = require('./lib/google-slides-manager');
const TranscriptParser = require('./lib/transcript-parser');
const { SlideSelectionEngine } = require('./lib/slide-selection-engine');
const { SlideContentGenerator } = require('./lib/slide-content-generator');
const ClaudeAPIClient = require('./lib/claude-api-client');

// LLM-enhanced components (lazy-loaded for basic mode performance)
let TranscriptSemanticAnalyzer = null;
let ProposalPersonaEngine = null;
let ProposalEnhancementReviewer = null;

// Claude client for pain point summarization (lazy-loaded)
let claudeClient = null;

/**
 * Summarize pain points into concise statements using Claude
 * @param {string[]} painPoints - Raw pain points from transcript
 * @returns {Promise<string[]>} - Concise summarized pain points (8-12 words each)
 */
async function summarizePainPoints(painPoints) {
  if (!painPoints || painPoints.length === 0) return [];

  // Lazy-load client
  if (!claudeClient) {
    claudeClient = new ClaudeAPIClient({
      model: 'claude-sonnet-4-20250514',
      maxTokens: 500
    });
  }

  const prompt = `Summarize each pain point into a concise 8-12 word statement suitable for a sales proposal slide.
Keep the business meaning but make it punchy and professional.

Pain points to summarize:
${painPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Return ONLY a JSON array of strings, one summary per pain point. Example:
["Current admin support is slow and unresponsive", "Account transfers require manual intervention"]`;

  try {
    const response = await claudeClient.completeJSON(prompt, {
      system: 'You are a concise business writer. Output only valid JSON arrays.',
      maxTokens: 500
    });

    if (Array.isArray(response)) {
      return response.slice(0, painPoints.length);
    }
    // Fallback if not valid array
    return painPoints;
  } catch (error) {
    console.warn(`   ⚠️ Pain point summarization failed: ${error.message}`);
    return painPoints; // Fallback to original
  }
}

const TEMPLATE_ID = '1VUGRtUbqwz-UIc9J2pDXp3PQllFdv9K27cHPrM-urhc';
const DEFAULT_SLIDES = 10;
const DEFAULT_TRANSCRIPT = process.env.TRANSCRIPT_PATH || null; // Must be provided via --transcript flag or TRANSCRIPT_PATH env var

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  // Help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Generate Sales Proposal from Discovery Call Transcript

Basic Usage:
  node generate-zeta-corp-proposal.js --transcript <file>
  node generate-zeta-corp-proposal.js --transcript <file> --id <presentationId>

Template-Based Selection:
  node generate-zeta-corp-proposal.js --transcript <file> --slides 10
  node generate-zeta-corp-proposal.js --transcript <file> --preview-selection

Enhanced Usage (LLM-powered):
  node generate-zeta-corp-proposal.js --transcript <file> --enhance
  node generate-zeta-corp-proposal.js --transcript <file> --enhance --persona executive
  node generate-zeta-corp-proposal.js --transcript <file> --enhance --auto-apply

Options:
  --transcript <file>   Path to transcript CSV file
  --id <id>             Update existing presentation instead of creating new
  --slides <n>          Target number of slides (default: 10)
  --preview-selection   Preview slide selection without generating presentation
  --enhance             Enable LLM semantic analysis and persona-based content
  --persona <type>      Target persona (default: auto-detect)
                        Options: executive, operations, technical, endUser
  --auto-apply          Automatically apply low-risk enhancement suggestions
  --review-only         Generate review without creating/updating presentation
  --verbose             Enable detailed logging
  --help                Show this help

Examples:
  # Basic generation with template-based selection
  node generate-zeta-corp-proposal.js --transcript call.csv

  # Preview which slides will be selected
  node generate-zeta-corp-proposal.js --transcript call.csv --preview-selection

  # Generate with specific slide count
  node generate-zeta-corp-proposal.js --transcript call.csv --slides 12

  # Enhanced with persona targeting
  node generate-zeta-corp-proposal.js --transcript call.csv --enhance --persona executive

  # Auto-apply all safe enhancements
  node generate-zeta-corp-proposal.js --transcript call.csv --enhance --auto-apply
`);
    process.exit(0);
  }

  const getArgValue = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : null;
  };

  return {
    transcriptPath: getArgValue('--transcript') || DEFAULT_TRANSCRIPT,
    existingId: getArgValue('--id') || (args[0] && !args[0].startsWith('--') ? args[0] : null),
    targetSlides: parseInt(getArgValue('--slides')) || DEFAULT_SLIDES,
    previewSelection: args.includes('--preview-selection'),
    enhance: args.includes('--enhance'),
    persona: getArgValue('--persona'),
    autoApply: args.includes('--auto-apply'),
    reviewOnly: args.includes('--review-only'),
    verbose: args.includes('--verbose')
  };
}

/**
 * Load LLM components (lazy loading for performance)
 */
function loadLLMComponents() {
  if (!TranscriptSemanticAnalyzer) {
    TranscriptSemanticAnalyzer = require('./lib/transcript-semantic-analyzer');
  }
  if (!ProposalPersonaEngine) {
    ProposalPersonaEngine = require('./lib/proposal-persona-engine');
  }
  if (!ProposalEnhancementReviewer) {
    ProposalEnhancementReviewer = require('./lib/proposal-enhancement-reviewer');
  }
}

/**
 * Run semantic analysis on transcript
 */
async function runSemanticAnalysis(transcriptPath, parsed, verbose) {
  console.log('\n🧠 Running semantic analysis...');

  loadLLMComponents();
  const analyzer = new TranscriptSemanticAnalyzer({ verbose });

  const rawTranscript = fs.readFileSync(transcriptPath, 'utf8');
  const analysis = await analyzer.analyze(rawTranscript, parsed);

  console.log(`   ✓ Deal health score: ${analysis.dealHealthScore}/100`);
  console.log(`   ✓ Buying readiness: ${analysis.buyingSignals.readiness}/10`);
  console.log(`   ✓ Implicit pain points: ${analysis.implicitPainPoints.length} identified`);
  console.log(`   ✓ Risk concerns: ${analysis.riskConcerns.length} identified`);

  return analysis;
}

/**
 * Detect or use specified persona
 */
async function detectPersona(semanticAnalysis, stakeholders, specifiedPersona, verbose) {
  console.log('\n👤 Detecting audience persona...');

  loadLLMComponents();
  const engine = new ProposalPersonaEngine({ verbose });

  if (specifiedPersona) {
    const personaDef = engine.getPersonaDefinition(specifiedPersona);
    if (!personaDef) {
      console.log(`   ⚠️ Unknown persona: ${specifiedPersona}, auto-detecting...`);
    } else {
      console.log(`   ✓ Using specified persona: ${personaDef.name}`);
      return {
        primary: specifiedPersona,
        primaryName: personaDef.name,
        confidence: 1.0,
        framingPriorities: personaDef.priorities.slice(0, 3),
        tone: personaDef.tone,
        contentFocus: personaDef.contentFocus,
        decisionMaker: semanticAnalysis.stakeholderDynamics?.decisionMaker
      };
    }
  }

  const persona = await engine.detectPersona(semanticAnalysis, stakeholders);
  console.log(`   ✓ Primary persona: ${persona.primaryName} (${Math.round(persona.confidence * 100)}% confidence)`);
  console.log(`   ✓ Secondary: ${persona.secondaryName || 'None'}`);
  console.log(`   ✓ Priorities: ${persona.framingPriorities.join(', ')}`);

  return persona;
}

/**
 * Reframe content for persona
 */
async function reframeForPersona(slideContent, parsed, semanticAnalysis, persona, verbose) {
  console.log('\n✨ Reframing content for persona...');

  loadLLMComponents();
  const engine = new ProposalPersonaEngine({ verbose });

  // Reframe pain points
  const originalPainPoints = [
    ...slideContent.currentState.bullets,
    ...slideContent.painPoints.processIssues,
    ...slideContent.painPoints.dataIssues
  ].slice(0, 8);

  const reframed = await engine.reframePainPoints(originalPainPoints, persona);

  // Update slide content with reframed pain points
  const reframedTexts = reframed.map(r => r.reframed);
  slideContent.currentState.bullets = reframedTexts.slice(0, 5);
  slideContent.painPoints.processIssues = reframedTexts.slice(0, 3);
  slideContent.painPoints.dataIssues = reframedTexts.slice(3, 6);

  console.log(`   ✓ Reframed ${reframed.length} pain points`);

  // Select best quote for persona
  const rankedQuotes = engine.rankQuotesForPersona(parsed.keyQuotes, persona);
  if (rankedQuotes.length > 0) {
    slideContent.currentState.quote = rankedQuotes[0].text;
    console.log(`   ✓ Selected best quote for ${persona.primaryName}`);
  }

  // Generate persona-specific solution framing
  const personaSolution = await engine.generatePersonaSpecificSolution(
    slideContent.solution,
    persona,
    semanticAnalysis
  );

  if (personaSolution.tier1) {
    slideContent.solution.tier1 = personaSolution.tier1;
    slideContent.solution.tier2 = personaSolution.tier2;
    slideContent.solution.tier3 = personaSolution.tier3;
    console.log(`   ✓ Tailored solution messaging`);
  }

  // Generate persona-specific summary
  const personaSummary = await engine.generatePersonaSummary(parsed, semanticAnalysis, persona);
  slideContent.executiveSummary = personaSummary;
  console.log(`   ✓ Generated persona-specific summary`);

  return slideContent;
}

/**
 * Review and enhance presentation
 */
async function reviewAndEnhance(presentationId, persona, semanticAnalysis, sourceData, autoApply, verbose) {
  console.log('\n📝 Reviewing presentation for enhancements...');

  loadLLMComponents();
  const reviewer = new ProposalEnhancementReviewer({ verbose, autoApply });

  const review = await reviewer.reviewPresentation(
    presentationId,
    persona,
    semanticAnalysis,
    sourceData
  );

  console.log(`   ✓ Overall score: ${review.overallScore}/10`);
  console.log(`   ✓ Suggestions: ${review.suggestions.length} total`);
  console.log(`   ✓ Auto-apply eligible: ${review.autoApplyEligible.length}`);
  console.log(`   ✓ Requires approval: ${review.requiresApproval.length}`);

  // Display assessment
  console.log(`\n   Assessment: ${review.overallAssessment}`);

  if (review.highestImpactChanges?.length > 0) {
    console.log('\n   Top Priority Changes:');
    review.highestImpactChanges.forEach((change, i) => {
      console.log(`     ${i + 1}. ${change}`);
    });
  }

  // Auto-apply if enabled
  if (autoApply && review.autoApplyEligible.length > 0) {
    console.log('\n🔄 Auto-applying safe enhancements...');
    const results = await reviewer.applyEnhancements(presentationId, review.autoApplyEligible);
    console.log(`   ✓ Applied: ${results.summary.applied}`);
    if (results.summary.failed > 0) {
      console.log(`   ⚠️ Failed: ${results.summary.failed}`);
    }
  }

  return review;
}

/**
 * Populate slides with content
 */
async function populateSlides(slidesManager, presentationId, slideContent, clientName) {
  console.log('\n✍️  Populating content using element-targeted replacement...\n');

  // SLIDE 1: Title
  console.log('   Slide 1: Title');
  await slidesManager.populateSlideElements(presentationId, 0, [
    { index: 0, text: slideContent.title.main },
    { index: 1, text: slideContent.title.subtitle }
  ]);
  console.log('      ✓ Title and subtitle updated');

  // SLIDE 2: Executive Summary Section
  console.log('   Slide 2: Executive Summary Section');
  await slidesManager.populateSlideElements(presentationId, 1, [
    { index: 0, text: 'Executive Summary' },
    { index: 1, text: 'Discovery Call Findings' }
  ]);
  console.log('      ✓ Section header updated');

  // SLIDE 3: Agenda
  console.log('   Slide 3: Agenda');
  const agendaTopics = `Current State\n10 minutes\n\nProposed Solution\n15 minutes\n\nInvestment & Next Steps\n10 minutes\n\nQ&A\n10 minutes`;
  await slidesManager.populateSlideElements(presentationId, 2, [
    { index: 0, text: 'Meeting Agenda' },
    { index: 1, text: `${clientName} Discovery Follow-up` },
    { index: 2, text: agendaTopics }
  ]);
  console.log('      ✓ Agenda populated');

  // SLIDE 4: Tech Stack
  console.log('   Slide 4: Tech Stack');
  const techStackTitle = `${slideContent.techStack.title}\n\n${slideContent.techStack.items.join('  •  ')}`;
  await slidesManager.populateSlideElements(presentationId, 3, [
    { index: 0, text: techStackTitle }
  ]);
  console.log('      ✓ Tech stack listed');

  // SLIDE 5: Current State Assessment
  console.log('   Slide 5: Current State Assessment');
  const bulletList = slideContent.currentState.bullets.map(b => `• ${b}`).join('\n');
  const quoteText = slideContent.currentState.quote
    ? `"${slideContent.currentState.quote}"\n— ${slideContent.currentState.quoteAuthor}`
    : 'Key challenges identified during discovery call';

  await slidesManager.populateSlideElements(presentationId, 4, [
    { index: 0, text: slideContent.currentState.title },
    { index: 1, text: bulletList },
    { index: 2, text: quoteText }
  ]);
  console.log('      ✓ Pain points and quote populated');

  // SLIDE 6: Key Challenges (Two-Column)
  console.log('   Slide 6: Key Challenges (Two-Column)');
  const leftColumnContent = `Process Issues\n\n${slideContent.painPoints.processIssues.map(p => `• ${p}`).join('\n')}`;
  const rightColumnContent = `Data Issues\n\n${slideContent.painPoints.dataIssues.map(p => `• ${p}`).join('\n')}`;

  await slidesManager.populateSlideElements(presentationId, 5, [
    { index: 0, text: slideContent.painPoints.title },
    { index: 1, text: leftColumnContent },
    { index: 2, text: rightColumnContent }
  ]);
  console.log('      ✓ Left column: Process Issues');
  console.log('      ✓ Right column: Data Issues');

  // SLIDE 7: Solution Framework (Three-Column)
  console.log('   Slide 7: Solution Framework (Three-Column)');
  const tier1 = slideContent.solution.tier1;
  const tier2 = slideContent.solution.tier2;
  const tier3 = slideContent.solution.tier3;

  const tier1Content = `${tier1.name}\n\n${tier1.items.map(i => `• ${i}`).join('\n')}`;
  const tier2Content = `${tier2.name}\n\n${tier2.items.map(i => `• ${i}`).join('\n')}`;
  const tier3Content = `${tier3.name}\n\n${tier3.items.map(i => `• ${i}`).join('\n')}`;

  await slidesManager.populateSlideElements(presentationId, 6, [
    { index: 0, text: slideContent.solution.title },
    { index: 1, text: tier1Content },
    { index: 2, text: tier2Content },
    { index: 3, text: tier3Content }
  ]);
  console.log('      ✓ Column 1: ' + tier1.name);
  console.log('      ✓ Column 2: ' + tier2.name);
  console.log('      ✓ Column 3: ' + tier3.name);

  // SLIDE 8: Investment & Next Steps
  console.log('   Slide 8: Investment & Next Steps');
  const nextStepsList = slideContent.investment.nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n');

  await slidesManager.populateSlideElements(presentationId, 7, [
    { index: 0, text: slideContent.investment.title },
    { index: 1, text: slideContent.investment.budget },
    { index: 2, text: 'Monthly Investment' },
    { index: 3, text: slideContent.investment.timeline },
    { index: 4, text: 'Target Start Date' },
    { index: 5, text: nextStepsList },
    { index: 6, text: 'Next Steps' }
  ]);
  console.log('      ✓ Investment details populated');
  console.log('      ✓ Next steps listed');

  console.log('\n✅ All slides populated successfully');
}

/**
 * Build buyer context from parsed transcript for slide selection
 */
function buildBuyerContext(parsed, persona, semanticAnalysis) {
  return {
    painPoints: parsed?.painPoints?.map(p => p.text || p) || [],
    techStack: parsed?.techStack || [],
    services: extractServicesFromPainPoints(parsed?.painPoints || []),
    persona: persona?.primary || 'operations',
    industry: parsed?.client?.industry || '',
    semanticScores: semanticAnalysis?.slideRankings || {}
  };
}

/**
 * Extract service types from pain points
 */
function extractServicesFromPainPoints(painPoints) {
  const services = new Set();
  const servicePatterns = {
    'RevOps': /revops|revenue|pipeline|forecast/i,
    'Integration': /integrat|sync|connect|api/i,
    'Salesforce Administration': /salesforce|admin|support|sfdc|crm/i,
    'Data Quality': /data quality|duplicate|clean|enrich/i,
    'Automation': /automat|workflow|process|flow/i,
    'Reporting': /report|dashboard|visib|analytic/i
  };

  for (const painPoint of painPoints) {
    const text = painPoint.text || painPoint;
    for (const [service, pattern] of Object.entries(servicePatterns)) {
      if (pattern.test(text)) {
        services.add(service);
      }
    }
  }

  return [...services];
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  console.log('🚀 Generating Sales Proposal from Discovery Call');
  if (options.enhance) {
    console.log('   Mode: LLM-Enhanced (Persona-Aware)');
  } else {
    console.log('   Mode: Template-Based Selection');
  }
  console.log(`   Target slides: ${options.targetSlides}`);
  console.log('');

  // Parse transcript
  console.log('📄 Parsing transcript...');
  const parser = new TranscriptParser({ verbose: options.verbose });

  let slideContent;
  let clientName = 'Client';
  let parsed = null;

  if (fs.existsSync(options.transcriptPath)) {
    parsed = await parser.parse(options.transcriptPath);
    slideContent = parser.generateSlideContent(parsed);
    clientName = parsed.client.companyName;

    console.log(`   ✓ Client: ${clientName}`);
    console.log(`   ✓ Contact: ${parsed.stakeholders[0]?.name} (${parsed.stakeholders[0]?.role})`);
    console.log(`   ✓ Pain points: ${parsed.painPoints.length} identified`);
    console.log(`   ✓ Tech stack: ${parsed.techStack.join(', ')}`);
    console.log(`   ✓ Budget: ${parsed.budget.range}`);
  } else {
    console.log(`   ⚠️  Transcript not found: ${options.transcriptPath}`);
    console.log('   Using default content...');

    slideContent = getDefaultSlideContent();
  }

  // Enhanced mode: Run semantic analysis and persona detection
  let semanticAnalysis = null;
  let persona = null;

  if (options.enhance && parsed) {
    semanticAnalysis = await runSemanticAnalysis(
      options.transcriptPath,
      parsed,
      options.verbose
    );

    persona = await detectPersona(
      semanticAnalysis,
      parsed.stakeholders,
      options.persona,
      options.verbose
    );

    slideContent = await reframeForPersona(
      slideContent,
      parsed,
      semanticAnalysis,
      persona,
      options.verbose
    );
  }

  // Build buyer context for slide selection
  const buyerContext = buildBuyerContext(parsed, persona, semanticAnalysis);

  // Initialize slide selection engine
  console.log('\n🎯 Running template-based slide selection...');
  const selectionEngine = new SlideSelectionEngine({ verbose: options.verbose });
  const selectedSlides = await selectionEngine.selectSlides(buyerContext, {
    targetSlides: options.targetSlides
  });

  // Display selection
  console.log(selectionEngine.formatSelectionForDisplay(selectedSlides));

  // Preview mode - exit after showing selection
  if (options.previewSelection) {
    console.log('📊 Preview mode - no presentation generated');
    console.log('\nSelected slide details:');
    selectedSlides.forEach(slide => {
      console.log(`  [${slide.slideIndex}] ${slide.title}`);
      console.log(`      Score breakdown: ${JSON.stringify(slide.scoreBreakdown || {})}`);
    });
    return { previewOnly: true, selectedSlides, buyerContext };
  }

  // Review only mode
  if (options.reviewOnly) {
    console.log('\n📊 Review-only mode - no presentation changes');

    if (semanticAnalysis) {
      console.log('\nSemantic Analysis Summary:');
      console.log(JSON.stringify(semanticAnalysis, null, 2));
    }

    if (persona) {
      console.log('\nPersona Detection:');
      console.log(JSON.stringify(persona, null, 2));
    }

    return { reviewOnly: true, semanticAnalysis, persona, slideContent, selectedSlides };
  }

  // Initialize slides manager
  const slidesManager = new GoogleSlidesManager({ verbose: options.verbose });
  let presentation;
  let isNewPresentation = false;

  if (options.existingId) {
    console.log(`\n📋 Updating existing presentation: ${options.existingId}`);
    presentation = {
      presentationId: options.existingId,
      url: `https://docs.google.com/presentation/d/${options.existingId}/edit`
    };
  } else {
    console.log('\n📋 Cloning template...');
    presentation = await slidesManager.cloneTemplate(
      TEMPLATE_ID,
      `RevPal Proposal for ${clientName} - Salesforce & Marketing Ops`
    );
    console.log(`   ✅ Created: ${presentation.presentationId}`);
    console.log(`   💡 Update with: node generate-zeta-corp-proposal.js --id ${presentation.presentationId}`);
    isNewPresentation = true;
  }

  // Get slide structure
  console.log('\n📋 Fetching presentation structure...');
  const fullPresentation = await slidesManager.getPresentation(presentation.presentationId);
  const slides = fullPresentation.slides;
  console.log(`   Found ${slides.length} slides`);

  // Trim to selected slides using selection engine
  if (isNewPresentation) {
    console.log(`\n🗑️  Trimming to ${selectedSlides.length} selected slides...`);
    const slidesToDelete = selectionEngine.getSlidesToDelete(selectedSlides);
    console.log(`   Will remove ${slidesToDelete.length} slides`);

    // Delete slides in reverse order (to preserve indexes)
    for (const slideIdx of slidesToDelete) {
      if (slideIdx < slides.length) {
        await slidesManager.deleteSlide(presentation.presentationId, slides[slideIdx].objectId);
      }
    }
    console.log(`   ✅ Trimmed to selected slides`);
  }

  // Populate slides with personalized content from transcript
  // This creates NET NEW slides and personalizes adjustable template slides
  await populateSelectedSlides(
    slidesManager,
    presentation.presentationId,
    slideContent,
    clientName,
    selectedSlides,
    parsed,          // Pass parsed transcript for content
    semanticAnalysis // Pass semantic analysis for enhanced content
  );

  // Enhanced mode: Review and optionally apply enhancements
  let review = null;
  if (options.enhance && semanticAnalysis && persona) {
    review = await reviewAndEnhance(
      presentation.presentationId,
      persona,
      semanticAnalysis,
      parsed,
      options.autoApply,
      options.verbose
    );
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log(`📊 SALES PROPOSAL FOR ${clientName.toUpperCase()}`);
  console.log('═'.repeat(70));
  console.log(`\n📎 URL: ${presentation.url}`);
  console.log(`📄 Transcript: ${options.transcriptPath}`);
  console.log(`📈 Slides: ${selectedSlides.length} (dynamically selected)`);
  console.log(`💰 Budget: ${slideContent.investment.budget}`);
  console.log(`📅 Timeline: ${slideContent.investment.timeline}`);

  if (options.enhance) {
    console.log(`\n🧠 Enhanced Mode:`);
    console.log(`   Persona: ${persona?.primaryName || 'Auto-detected'}`);
    console.log(`   Deal Health: ${semanticAnalysis?.dealHealthScore || 'N/A'}/100`);
    console.log(`   Quality Score: ${review?.overallScore || 'N/A'}/10`);
  }

  console.log('\n📋 Selected Slides:');
  selectedSlides.slice(0, 5).forEach((slide, i) => {
    console.log(`   ${i + 1}. ${slide.title} (${Math.round(slide.score * 100)}%)`);
  });
  if (selectedSlides.length > 5) {
    console.log(`   ... and ${selectedSlides.length - 5} more`);
  }

  console.log(`\n👉 Open and review the presentation\n`);

  return {
    presentation,
    slideContent,
    selectedSlides,
    semanticAnalysis,
    persona,
    review
  };
}

/**
 * Populate selected slides with personalized content
 *
 * This function:
 * 1. Creates NET NEW slides (Title, Executive Summary, What We Heard)
 * 2. Personalizes ADJUSTABLE template slides (investment, closing)
 * 3. Keeps template content for KEEP slides (case studies, services, team)
 */
async function populateSelectedSlides(slidesManager, presentationId, slideContent, clientName, selectedSlides, parsed, semanticAnalysis) {
  console.log('\n✍️  Building personalized proposal deck...\n');

  // Initialize content generator
  const contentGenerator = new SlideContentGenerator({ verbose: false });

  // Generate NET NEW slide content
  const netNewContent = contentGenerator.generateNetNewSlides(parsed, semanticAnalysis);
  console.log(`   Generated content for ${netNewContent.length} NET NEW slides`);

  // Get current presentation structure
  const presentation = await slidesManager.getPresentation(presentationId);
  let currentSlides = presentation.slides;

  // Track NET NEW slides we need to create
  const netNewSlides = selectedSlides.filter(s => s.isNetNew);
  const templateSlides = selectedSlides.filter(s => !s.isNetNew);

  console.log(`\n   📊 Deck composition:`);
  console.log(`      🆕 NET NEW slides to create: ${netNewSlides.length}`);
  console.log(`      📋 Template slides to keep: ${templateSlides.length}`);

  // PHASE 1: Create NET NEW slides at the beginning
  console.log('\n   Phase 1: Creating NET NEW slides...');

  for (let i = 0; i < netNewSlides.length; i++) {
    const slideSpec = netNewSlides[i];
    const content = netNewContent.find(c => c.role === slideSpec.role);

    if (!content) {
      console.log(`      ⚠️ No content for ${slideSpec.role}`);
      continue;
    }

    console.log(`      Creating: ${slideSpec.title}`);

    try {
      // Create a new slide at position i
      const newSlide = await createNetNewSlide(slidesManager, presentationId, slideSpec, content, i);
      console.log(`         ✓ Created ${slideSpec.role} slide`);
    } catch (error) {
      console.log(`         ⚠️ Error creating ${slideSpec.role}: ${error.message}`);
    }
  }

  // Refresh presentation structure after adding slides
  const updatedPresentation = await slidesManager.getPresentation(presentationId);
  currentSlides = updatedPresentation.slides;

  // PHASE 2: Personalize ADJUSTABLE template slides
  console.log('\n   Phase 2: Personalizing template slides...');

  // Calculate offset (NET NEW slides were added at beginning)
  const netNewOffset = netNewSlides.length;

  for (let i = 0; i < templateSlides.length; i++) {
    const slide = templateSlides[i];
    const slideIndex = netNewOffset + i;

    if (slideIndex >= currentSlides.length) {
      console.log(`      ⚠️ Slide ${slide.title} out of bounds`);
      continue;
    }

    console.log(`      Slide ${slideIndex + 1}: ${slide.title.substring(0, 35)}...`);

    try {
      // Determine personalization level based on slide type
      if (slide.type === 'investment') {
        await personalizeInvestmentSlide(slidesManager, presentationId, slideIndex, slide, slideContent, parsed);
        console.log(`         ✓ Investment personalized with budget/timeline`);
      } else if (slide.type === 'closing') {
        await personalizeClosingSlide(slidesManager, presentationId, slideIndex, slide, clientName);
        console.log(`         ✓ Closing personalized with client name`);
      } else if (slide.type === 'service' && slide.title.toLowerCase().includes('approach')) {
        await personalizeApproachSlide(slidesManager, presentationId, slideIndex, slide, clientName, parsed);
        console.log(`         ✓ Approach slide personalized`);
      } else {
        // KEEP slides - template content stays as-is
        console.log(`         ✓ Kept template content (${slide.type})`);
      }
    } catch (error) {
      console.log(`         ⚠️ Error: ${error.message}`);
    }
  }

  console.log('\n✅ Proposal deck personalization complete');
}

/**
 * Create a NET NEW slide in the presentation
 *
 * Uses Google's predefined layouts. The content will be properly formatted
 * even if it doesn't match the template's exact styling.
 */
async function createNetNewSlide(slidesManager, presentationId, slideSpec, content, position) {
  // Map role to predefined layouts
  const layoutMapping = {
    'title': 'TITLE',
    'executiveSummary': 'TITLE_AND_BODY',
    'whatWeHeard': 'TITLE_AND_BODY'  // Using TITLE_AND_BODY instead of TWO_COLUMNS for better readability
  };

  const layoutId = layoutMapping[slideSpec.role] || 'TITLE_AND_BODY';

  // Create slide with predefined layout
  await slidesManager.addSlide(presentationId, layoutId, { insertionIndex: position });

  // Get the new slide
  const updatedPresentation = await slidesManager.getPresentation(presentationId);
  const newSlide = updatedPresentation.slides[position];

  // Populate based on role
  switch (slideSpec.role) {
    case 'title':
      await populateTitleSlide(slidesManager, presentationId, position, content);
      break;
    case 'executiveSummary':
      await populateExecutiveSummarySlide(slidesManager, presentationId, position, content);
      break;
    case 'whatWeHeard':
      await populateWhatWeHeardSlide(slidesManager, presentationId, position, content);
      break;
  }

  return newSlide;
}

/**
 * Populate Title Slide content
 */
async function populateTitleSlide(slidesManager, presentationId, slideIndex, content) {
  const elements = [
    { index: 0, text: content.content.headline, fontSize: 44, bold: true },
    { index: 1, text: content.content.subtitle, fontSize: 24 }
  ];

  // Add prepared for text if available
  if (content.content.preparedFor) {
    elements.push({ index: 2, text: content.content.preparedFor, fontSize: 18 });
  }

  await slidesManager.populateSlideElements(presentationId, slideIndex, elements);
}

/**
 * Populate Executive Summary slide content
 * Limits content to fit on slide - keep it concise
 */
async function populateExecutiveSummarySlide(slidesManager, presentationId, slideIndex, content) {
  // Helper to truncate text (70 chars = ~9" placeholder at 14pt)
  const truncate = (text, maxLen = 70) =>
    text.length > maxLen ? text.substring(0, maxLen - 3) + '...' : text;

  // DIFFERENTIATION: Skip "Current Situation" (index 0) - that's covered in "What We Heard"
  // Focus on "Recommended Approach" (index 1) and "Expected Outcomes" (index 2)
  const sections = content.content.sections || [];
  const approachSection = sections.find(s => s.title === 'Recommended Approach') || sections[1];
  const outcomesSection = sections.find(s => s.title === 'Expected Outcomes') || sections[2];

  // Build approach bullets (2-3)
  const approachBullets = (approachSection?.bullets || [])
    .slice(0, 3)
    .map(b => `• ${truncate(b)}`)
    .join('\n');

  // Build outcomes bullets (2-3)
  const outcomesBullets = (outcomesSection?.bullets || [])
    .slice(0, 3)
    .map(b => `• ${truncate(b)}`)
    .join('\n');

  // Combine with section headers for clarity
  let bodyText = '';
  if (approachBullets) {
    bodyText += `Our Approach:\n${approachBullets}`;
  }
  if (outcomesBullets) {
    bodyText += `\n\nExpected Outcomes:\n${outcomesBullets}`;
  }

  // Add investment summary (compact)
  const investmentText = content.content.investmentSummary ?
    `\n\nInvestment: ${content.content.investmentSummary.monthlyInvestment}` :
    '';

  await slidesManager.populateSlideElements(presentationId, slideIndex, [
    { index: 0, text: content.content.headline, fontSize: 32, bold: true },
    { index: 1, text: bodyText.trim(), fontSize: 14 }
  ]);
}

/**
 * Populate "What We Heard" slide content
 * Uses LLM to summarize pain points into concise statements
 */
async function populateWhatWeHeardSlide(slidesManager, presentationId, slideIndex, content) {
  // Get raw pain points (max 4)
  const rawPainPoints = content.content.painPointCategories
    .flatMap(cat => cat.items)
    .slice(0, 4);

  // Summarize pain points using Claude (8-12 words each)
  console.log('         Summarizing pain points...');
  const summarizedPainPoints = await summarizePainPoints(rawPainPoints);

  // Build pain points list
  const painPointsList = summarizedPainPoints
    .map(item => `• ${item}`)
    .join('\n');

  // Build quote section (use smart truncate for quotes)
  let quoteText = '';
  if (content.content.quote) {
    const quoteContent = content.content.quote.text;
    // Keep quotes shorter - 60 chars max, cut at word boundary
    const maxLen = 60;
    let shortQuote = quoteContent;
    if (quoteContent.length > maxLen) {
      const truncated = quoteContent.substring(0, maxLen - 3);
      const lastSpace = truncated.lastIndexOf(' ');
      shortQuote = lastSpace > 30 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
    }
    quoteText = `\n\n"${shortQuote}"`;
  }

  // Tech stack - compact
  const techStackText = content.content.techStack?.length > 0 ?
    `\n\nTools: ${content.content.techStack.slice(0, 4).join(', ')}` :
    '';

  // Combine all content into body
  const bodyContent = `${painPointsList}${quoteText}${techStackText}`.trim();

  await slidesManager.populateSlideElements(presentationId, slideIndex, [
    { index: 0, text: content.content.headline, fontSize: 32, bold: true },
    { index: 1, text: bodyContent, fontSize: 14 }
  ]);
}

/**
 * Personalize Investment slide with parsed budget/timeline
 */
async function personalizeInvestmentSlide(slidesManager, presentationId, slideIndex, slide, slideContent, parsed) {
  const budget = parsed?.budget?.range || slideContent?.investment?.budget || 'To be discussed';
  const timeline = parsed?.timeline?.startDate || parsed?.timeline?.preference || slideContent?.investment?.timeline || 'Flexible';

  // Find and update budget/timeline elements via text replacement
  await slidesManager.replaceTextInPresentation(presentationId, [
    { find: '{{BUDGET}}', replace: budget },
    { find: '{{TIMELINE}}', replace: timeline },
    { find: '$X,XXX', replace: budget },
    { find: 'TBD', replace: timeline }
  ]);
}

/**
 * Personalize Closing slide with client name
 */
async function personalizeClosingSlide(slidesManager, presentationId, slideIndex, slide, clientName) {
  await slidesManager.replaceTextInPresentation(presentationId, [
    { find: '{{CLIENT}}', replace: clientName },
    { find: '[Client]', replace: clientName },
    { find: 'Client Name', replace: clientName }
  ]);
}

/**
 * Personalize Approach slide with client context
 */
async function personalizeApproachSlide(slidesManager, presentationId, slideIndex, slide, clientName, parsed) {
  await slidesManager.replaceTextInPresentation(presentationId, [
    { find: '{{CLIENT}}', replace: clientName },
    { find: '[Client]', replace: clientName }
  ]);
}

/**
 * Get default slide content when no transcript available
 */
function getDefaultSlideContent() {
  return {
    title: {
      main: 'Salesforce & Marketing Ops',
      subtitle: `Proposal for Client | ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
    },
    executiveSummary: 'RevPal proposes a phased approach to address Salesforce and marketing operations challenges.',
    currentState: {
      title: 'Current State Assessment',
      bullets: ['Technical debt in Salesforce', 'High volume of admin requests', 'Missing sales reporting', 'MQL processing delays', 'Data duplication issues'],
      quote: 'Ugliest CRM implementation I\'ve encountered',
      quoteAuthor: 'Client CEO'
    },
    techStack: {
      title: 'Current Tech Stack',
      items: ['Salesforce', 'Marketo', 'PandaDoc', 'Groove', 'Excel']
    },
    painPoints: {
      title: 'Key Challenges',
      processIssues: ['Manual workflow bottlenecks', 'Reporting inconsistencies', 'Lead routing delays'],
      dataIssues: ['Data duplication problems', 'Missing attribution', 'Sync failures']
    },
    solution: {
      title: 'RevPal Solution Framework',
      tier1: { name: 'Day-to-Day Support', items: ['Account transfers', 'Report fixes', 'Campaign setup', 'Data corrections'] },
      tier2: { name: 'Quick-Turn Projects', items: ['Activity metrics', 'Pipeline dashboards', 'Event attribution', 'Lead routing'] },
      tier3: { name: 'Strategic Initiatives', items: ['Data quality remediation', 'Process automation', 'Reporting overhaul', 'Integration optimization'] }
    },
    investment: {
      title: 'Investment & Next Steps',
      budget: '$10,000 - $20,000/month',
      timeline: 'January 2025',
      nextSteps: ['Review and approve proposal', 'Sign Statement of Work', 'Kick-off meeting scheduled']
    }
  };
}

// Run main
main()
  .then((result) => {
    if (result.reviewOnly) {
      console.log('✅ Review complete');
    } else {
      console.log('✅ Success');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
