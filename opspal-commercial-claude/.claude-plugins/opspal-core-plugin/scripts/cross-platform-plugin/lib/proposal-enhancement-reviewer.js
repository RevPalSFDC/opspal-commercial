#!/usr/bin/env node

/**
 * Proposal Enhancement Reviewer
 *
 * Uses LLM to review generated presentations and suggest improvements.
 * Applies quality gates to prevent hallucination and ensure brand compliance.
 *
 * Features:
 * - Presentation quality scoring
 * - Persona-targeted improvement suggestions
 * - Quality gate validation
 * - Auto-apply for low-risk enhancements
 *
 * @example
 * const reviewer = new ProposalEnhancementReviewer();
 * const review = await reviewer.reviewPresentation(presentationId, persona, semanticAnalysis);
 */

const fs = require('fs');
const path = require('path');
const ClaudeAPIClient = require('./claude-api-client');
const GoogleSlidesManager = require('./google-slides-manager');

// Load enhancement rules
const configPath = path.join(__dirname, '..', '..', 'config', 'enhancement-rules.json');
const ENHANCEMENT_RULES = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : require('../../config/enhancement-rules.json');

class ProposalEnhancementReviewer {
  /**
   * Initialize the enhancement reviewer
   *
   * @param {Object} options - Configuration options
   * @param {string} options.model - Claude model to use
   * @param {boolean} options.verbose - Enable verbose logging
   * @param {boolean} options.autoApply - Auto-apply low-risk enhancements
   */
  constructor(options = {}) {
    this.client = new ClaudeAPIClient({
      model: options.model || 'claude-sonnet-4-20250514',
      verbose: options.verbose || false
    });
    this.slidesManager = new GoogleSlidesManager({
      verbose: options.verbose || false
    });
    this.verbose = options.verbose || false;
    this.autoApply = options.autoApply !== false;
    this.rules = ENHANCEMENT_RULES;
  }

  /**
   * Review a presentation and generate enhancement suggestions
   *
   * @param {string} presentationId - Google Slides presentation ID
   * @param {Object} persona - Detected persona
   * @param {Object} semanticAnalysis - Semantic analysis results
   * @param {Object} sourceData - Original transcript/parsed data for validation
   * @returns {Promise<Object>} - Review results with suggestions
   */
  async reviewPresentation(presentationId, persona, semanticAnalysis, sourceData = {}) {
    this.log('Starting presentation review...');

    // Get presentation content
    const presentation = await this.slidesManager.getPresentation(presentationId);
    const slideContent = this.extractSlideContent(presentation);

    this.log(`Extracted content from ${slideContent.length} slides`);

    // Build review prompt
    const prompt = this.buildReviewPrompt(slideContent, persona, semanticAnalysis);

    // Get LLM review
    const reviewResult = await this.client.completeJSON(prompt);

    // Validate suggestions against quality gates
    const validatedSuggestions = this.validateSuggestions(
      reviewResult.enhancements || [],
      sourceData,
      persona
    );

    // Categorize by impact level
    const categorized = this.categorizeSuggestions(validatedSuggestions);

    const result = {
      presentationId,
      overallScore: reviewResult.overallScore || 0,
      overallAssessment: reviewResult.overallAssessment || '',
      suggestions: validatedSuggestions,
      categorized,
      highestImpactChanges: reviewResult.highestImpactChanges || [],
      autoApplyEligible: categorized.autoApply,
      requiresApproval: categorized.requiresApproval,
      metadata: {
        reviewedAt: new Date().toISOString(),
        persona: persona.primary,
        slidesReviewed: slideContent.length,
        tokenUsage: this.client.getUsageStats()
      }
    };

    this.log(`Review complete: ${result.suggestions.length} suggestions, score ${result.overallScore}/10`);

    return result;
  }

  /**
   * Extract text content from presentation slides
   */
  extractSlideContent(presentation) {
    const slides = [];

    for (let i = 0; i < presentation.slides.length; i++) {
      const slide = presentation.slides[i];
      const elements = [];

      if (slide.pageElements) {
        for (const element of slide.pageElements) {
          if (element.shape?.text) {
            const text = element.shape.text.textElements
              .map(te => te.textRun?.content || '')
              .join('')
              .trim();

            if (text) {
              elements.push({
                objectId: element.objectId,
                text,
                type: this.inferElementType(text, i)
              });
            }
          }
        }
      }

      slides.push({
        slideNumber: i + 1,
        slideId: slide.objectId,
        elements
      });
    }

    return slides;
  }

  /**
   * Infer element type from content and position
   */
  inferElementType(text, slideIndex) {
    const textLower = text.toLowerCase();
    const wordCount = text.split(/\s+/).length;

    if (wordCount <= 5 && slideIndex === 0) return 'title';
    if (wordCount <= 10 && textLower.includes('proposal')) return 'title';
    if (text.startsWith('"') || text.includes('"')) return 'quote';
    if (text.includes('\n') && text.split('\n').length > 2) return 'bullets';
    if (wordCount <= 15) return 'heading';
    return 'content';
  }

  /**
   * Build the review prompt
   */
  buildReviewPrompt(slideContent, persona, semanticAnalysis) {
    const slideText = slideContent.map(slide => {
      const elements = slide.elements.map(e => `  [${e.type}] ${e.text}`).join('\n');
      return `Slide ${slide.slideNumber}:\n${elements}`;
    }).join('\n\n');

    return `You are a sales proposal expert reviewing a presentation for a ${persona.primaryName} audience.

## PRESENTATION CONTENT:
${slideText}

## AUDIENCE PROFILE:
- Primary Persona: ${persona.primaryName}
- Decision Maker: ${semanticAnalysis.stakeholderDynamics?.decisionMaker || 'Unknown'}
- Key Priorities: ${persona.framingPriorities?.join(', ') || 'ROI, timeline, risk'}
- Risk Concerns: ${semanticAnalysis.riskConcerns?.map(r => r.concern).join(', ') || 'None identified'}
- Urgency Level: ${semanticAnalysis.buyingSignals?.readiness || 5}/10
- Deal Health: ${semanticAnalysis.dealHealthScore || 50}/100

## REVIEW CRITERIA:
1. **Compelling Opening**: Does the title slide hook the audience immediately?
2. **Pain Point Framing**: Are pain points framed in terms a ${persona.primaryName} cares about?
3. **Solution Value**: Is the solution positioned as addressing their specific concerns?
4. **Quote Impact**: Is the featured quote the most compelling for this audience?
5. **ROI Clarity**: Is the investment justified with clear value?
6. **Call to Action**: Are next steps clear and actionable?

## QUALITY RULES:
- Title max length: ${this.rules.validation.slides.title.maxLength} characters
- Bullet max length: ${this.rules.validation.slides.bullet.maxLength} characters
- Quote max length: ${this.rules.validation.slides.quote.maxLength} characters
- Required branding: ${this.rules.branding.requiredElements.join(', ')}
- Prohibited: ${this.rules.branding.prohibitedElements.join(', ')}

## RESPOND WITH JSON:
{
  "overallScore": 1-10,
  "overallAssessment": "Brief summary of proposal strength and weaknesses",
  "enhancements": [
    {
      "slideNumber": 1,
      "elementIndex": 0,
      "currentText": "...",
      "suggestedText": "...",
      "rationale": "Why this improves it for the ${persona.primaryName}",
      "impactLevel": "high|medium|low",
      "category": "hook|framing|clarity|tone|branding"
    }
  ],
  "highestImpactChanges": ["Top 3 changes that would most improve the proposal"]
}

Focus on substantive improvements, not minor wording tweaks. Prioritize changes that would resonate with a ${persona.primaryName}.`;
  }

  /**
   * Validate suggestions against quality gates
   */
  validateSuggestions(suggestions, sourceData, persona) {
    const validated = [];

    for (const suggestion of suggestions) {
      const validationResult = this.validateSuggestion(suggestion, sourceData, persona);

      if (validationResult.valid) {
        validated.push({
          ...suggestion,
          validation: validationResult
        });
      } else {
        this.log(`Rejected suggestion: ${validationResult.reason}`);
      }
    }

    return validated;
  }

  /**
   * Validate a single suggestion
   */
  validateSuggestion(suggestion, sourceData, persona) {
    const result = {
      valid: true,
      warnings: [],
      reason: null
    };

    const suggestedText = suggestion.suggestedText || '';

    // Length validation
    const elementType = this.inferElementType(suggestedText, suggestion.slideNumber - 1);
    const lengthRules = this.rules.validation.slides[elementType] || this.rules.validation.slides.content;

    if (lengthRules.maxLength && suggestedText.length > lengthRules.maxLength) {
      result.warnings.push(`Text exceeds max length (${suggestedText.length}/${lengthRules.maxLength})`);
    }

    // Prohibited patterns check
    for (const prohibited of this.rules.factualAccuracy.prohibitedPatterns) {
      const regex = new RegExp(prohibited.pattern, 'i');
      if (regex.test(suggestedText)) {
        result.valid = false;
        result.reason = `Contains prohibited pattern: ${prohibited.reason}`;
        return result;
      }
    }

    // Brand compliance
    for (const prohibited of this.rules.branding.prohibitedElements) {
      if (suggestedText.toLowerCase().includes(prohibited.toLowerCase())) {
        result.valid = false;
        result.reason = `Contains prohibited element: ${prohibited}`;
        return result;
      }
    }

    // Tone consistency check
    const personaTone = this.rules.toneConsistency.prohibitedWords[persona.primary] || [];
    for (const word of personaTone) {
      if (suggestedText.toLowerCase().includes(word.toLowerCase())) {
        result.warnings.push(`Contains word inappropriate for ${persona.primary}: ${word}`);
      }
    }

    // Hallucination prevention (if source data available)
    if (sourceData.painPoints) {
      const hasUnknownStat = /\d{2,}%/.test(suggestedText);
      const sourceStats = JSON.stringify(sourceData).match(/\d{2,}%/g) || [];

      if (hasUnknownStat) {
        const suggestedStats = suggestedText.match(/\d{2,}%/g) || [];
        for (const stat of suggestedStats) {
          if (!sourceStats.includes(stat)) {
            result.warnings.push(`Statistic ${stat} not found in source data`);
          }
        }
      }
    }

    return result;
  }

  /**
   * Categorize suggestions by impact and auto-apply eligibility
   */
  categorizeSuggestions(suggestions) {
    const autoApply = [];
    const requiresApproval = [];

    for (const suggestion of suggestions) {
      const impact = suggestion.impactLevel || 'medium';
      const impactRules = this.rules.enhancementImpact.levels[impact];

      if (impactRules?.autoApply && !suggestion.validation?.warnings?.length) {
        autoApply.push(suggestion);
      } else {
        requiresApproval.push(suggestion);
      }
    }

    return {
      autoApply,
      requiresApproval,
      byImpact: {
        high: suggestions.filter(s => s.impactLevel === 'high'),
        medium: suggestions.filter(s => s.impactLevel === 'medium'),
        low: suggestions.filter(s => s.impactLevel === 'low')
      }
    };
  }

  /**
   * Apply approved enhancements to the presentation
   *
   * @param {string} presentationId - Presentation ID
   * @param {Array} enhancements - Approved enhancements to apply
   * @returns {Promise<Object>} - Application results
   */
  async applyEnhancements(presentationId, enhancements) {
    this.log(`Applying ${enhancements.length} enhancements...`);

    const results = {
      applied: [],
      failed: [],
      skipped: []
    };

    // Get current presentation to get element IDs
    const presentation = await this.slidesManager.getPresentation(presentationId);
    const slideContent = this.extractSlideContent(presentation);

    for (const enhancement of enhancements) {
      try {
        // Find the element to update
        const slide = slideContent[enhancement.slideNumber - 1];
        if (!slide) {
          results.skipped.push({
            enhancement,
            reason: `Slide ${enhancement.slideNumber} not found`
          });
          continue;
        }

        const element = slide.elements[enhancement.elementIndex];
        if (!element) {
          results.skipped.push({
            enhancement,
            reason: `Element ${enhancement.elementIndex} not found on slide ${enhancement.slideNumber}`
          });
          continue;
        }

        // Apply the update
        await this.slidesManager.replaceElementText(
          presentationId,
          element.objectId,
          enhancement.suggestedText
        );

        results.applied.push({
          slideNumber: enhancement.slideNumber,
          elementIndex: enhancement.elementIndex,
          before: enhancement.currentText,
          after: enhancement.suggestedText,
          impactLevel: enhancement.impactLevel
        });

        this.log(`Applied: Slide ${enhancement.slideNumber}, Element ${enhancement.elementIndex}`);

      } catch (error) {
        results.failed.push({
          enhancement,
          error: error.message
        });
        this.log(`Failed: ${error.message}`);
      }
    }

    results.summary = {
      total: enhancements.length,
      applied: results.applied.length,
      failed: results.failed.length,
      skipped: results.skipped.length
    };

    return results;
  }

  /**
   * Run pre-enhancement quality gates
   *
   * @param {string} presentationId - Presentation ID
   * @returns {Promise<Object>} - Gate check results
   */
  async runPreEnhancementGates(presentationId) {
    const results = {
      passed: true,
      checks: []
    };

    const presentation = await this.slidesManager.getPresentation(presentationId);
    const slideContent = this.extractSlideContent(presentation);

    // Check: All slides have content
    const emptySlides = slideContent.filter(s => s.elements.length === 0);
    results.checks.push({
      name: 'All slides have content',
      passed: emptySlides.length === 0,
      details: emptySlides.length > 0 ? `Empty slides: ${emptySlides.map(s => s.slideNumber).join(', ')}` : null
    });

    // Check: No placeholder text
    const allText = slideContent.flatMap(s => s.elements.map(e => e.text)).join(' ').toLowerCase();
    const hasPlaceholder = this.rules.branding.prohibitedElements.some(p =>
      allText.includes(p.toLowerCase())
    );
    results.checks.push({
      name: 'No placeholder text',
      passed: !hasPlaceholder,
      details: hasPlaceholder ? 'Found placeholder text' : null
    });

    // Check: Has branding
    const hasBranding = this.rules.branding.requiredElements.some(r =>
      allText.includes(r.toLowerCase())
    );
    results.checks.push({
      name: 'Branding elements present',
      passed: hasBranding,
      details: !hasBranding ? 'Missing required branding' : null
    });

    results.passed = results.checks.every(c => c.passed);

    return results;
  }

  /**
   * Generate a summary report of the review
   */
  generateReviewReport(reviewResult) {
    const lines = [];

    lines.push('='.repeat(70));
    lines.push('PROPOSAL ENHANCEMENT REVIEW');
    lines.push('='.repeat(70));
    lines.push('');
    lines.push(`Overall Score: ${reviewResult.overallScore}/10`);
    lines.push(`Assessment: ${reviewResult.overallAssessment}`);
    lines.push('');

    if (reviewResult.highestImpactChanges?.length > 0) {
      lines.push('TOP PRIORITY CHANGES:');
      reviewResult.highestImpactChanges.forEach((change, i) => {
        lines.push(`  ${i + 1}. ${change}`);
      });
      lines.push('');
    }

    lines.push(`SUGGESTIONS: ${reviewResult.suggestions.length} total`);
    lines.push(`  High Impact: ${reviewResult.categorized.byImpact.high.length}`);
    lines.push(`  Medium Impact: ${reviewResult.categorized.byImpact.medium.length}`);
    lines.push(`  Low Impact: ${reviewResult.categorized.byImpact.low.length}`);
    lines.push('');

    lines.push(`AUTO-APPLY ELIGIBLE: ${reviewResult.autoApplyEligible.length}`);
    lines.push(`REQUIRES APPROVAL: ${reviewResult.requiresApproval.length}`);
    lines.push('');

    if (reviewResult.requiresApproval.length > 0) {
      lines.push('SUGGESTIONS REQUIRING APPROVAL:');
      reviewResult.requiresApproval.forEach((s, i) => {
        lines.push(`\n  ${i + 1}. [${s.impactLevel.toUpperCase()}] Slide ${s.slideNumber}`);
        lines.push(`     Current: "${s.currentText?.substring(0, 50)}..."`);
        lines.push(`     Suggested: "${s.suggestedText?.substring(0, 50)}..."`);
        lines.push(`     Rationale: ${s.rationale}`);
        if (s.validation?.warnings?.length) {
          lines.push(`     Warnings: ${s.validation.warnings.join(', ')}`);
        }
      });
    }

    lines.push('');
    lines.push('='.repeat(70));

    return lines.join('\n');
  }

  /**
   * Log message if verbose mode is enabled
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[EnhancementReviewer] ${message}`, data || '');
    }
  }
}

module.exports = ProposalEnhancementReviewer;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
Proposal Enhancement Reviewer

Reviews presentations and suggests persona-targeted improvements.

Usage:
  node proposal-enhancement-reviewer.js --review <presentationId> [options]
  node proposal-enhancement-reviewer.js --gates <presentationId>
  node proposal-enhancement-reviewer.js --apply <presentationId> <suggestions.json>

Options:
  --persona <type>      Persona type (executive, operations, technical, endUser)
  --analysis <file>     Path to semantic analysis JSON
  --verbose             Enable verbose logging
  --help                Show this help

Examples:
  node proposal-enhancement-reviewer.js --review 1ABC...xyz --persona executive
  node proposal-enhancement-reviewer.js --gates 1ABC...xyz
`);
    process.exit(0);
  }

  const verbose = args.includes('--verbose');
  const reviewer = new ProposalEnhancementReviewer({ verbose });

  if (args.includes('--review')) {
    const idx = args.indexOf('--review');
    const presentationId = args[idx + 1];

    const personaIdx = args.indexOf('--persona');
    const personaType = personaIdx >= 0 ? args[personaIdx + 1] : 'executive';

    const analysisIdx = args.indexOf('--analysis');
    const analysisPath = analysisIdx >= 0 ? args[analysisIdx + 1] : null;

    if (!presentationId) {
      console.error('Error: Presentation ID required');
      process.exit(1);
    }

    (async () => {
      try {
        // Build mock persona and analysis if not provided
        const persona = {
          primary: personaType,
          primaryName: personaType === 'executive' ? 'Executive (CEO/CFO)' :
                       personaType === 'operations' ? 'Operations Leader' :
                       personaType === 'technical' ? 'Technical Leader' : 'End User',
          framingPriorities: ['ROI', 'timeline', 'risk']
        };

        let semanticAnalysis = {
          stakeholderDynamics: { decisionMaker: 'Unknown' },
          riskConcerns: [],
          buyingSignals: { readiness: 5 },
          dealHealthScore: 50
        };

        if (analysisPath && fs.existsSync(analysisPath)) {
          semanticAnalysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
        }

        console.log(`Reviewing presentation: ${presentationId}`);
        console.log(`Target persona: ${persona.primaryName}`);
        console.log('');

        const review = await reviewer.reviewPresentation(
          presentationId,
          persona,
          semanticAnalysis
        );

        console.log(reviewer.generateReviewReport(review));

        // Save full results
        const outputPath = `review-${presentationId.substring(0, 8)}.json`;
        fs.writeFileSync(outputPath, JSON.stringify(review, null, 2));
        console.log(`\nFull review saved to: ${outputPath}`);

      } catch (error) {
        console.error('Error:', error.message);
        if (verbose) console.error(error.stack);
        process.exit(1);
      }
    })();

  } else if (args.includes('--gates')) {
    const idx = args.indexOf('--gates');
    const presentationId = args[idx + 1];

    if (!presentationId) {
      console.error('Error: Presentation ID required');
      process.exit(1);
    }

    (async () => {
      try {
        console.log(`Running pre-enhancement gates on: ${presentationId}\n`);

        const gates = await reviewer.runPreEnhancementGates(presentationId);

        console.log('QUALITY GATE RESULTS:');
        console.log('='.repeat(40));

        for (const check of gates.checks) {
          const status = check.passed ? '✓' : '✗';
          console.log(`${status} ${check.name}`);
          if (check.details) {
            console.log(`  └─ ${check.details}`);
          }
        }

        console.log('');
        console.log(gates.passed ? '✓ All gates passed' : '✗ Some gates failed');

        process.exit(gates.passed ? 0 : 1);

      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    })();

  } else if (args.includes('--apply')) {
    const idx = args.indexOf('--apply');
    const presentationId = args[idx + 1];
    const suggestionsPath = args[idx + 2];

    if (!presentationId || !suggestionsPath) {
      console.error('Error: Presentation ID and suggestions file required');
      process.exit(1);
    }

    if (!fs.existsSync(suggestionsPath)) {
      console.error(`Error: Suggestions file not found: ${suggestionsPath}`);
      process.exit(1);
    }

    (async () => {
      try {
        const review = JSON.parse(fs.readFileSync(suggestionsPath, 'utf8'));
        const enhancements = review.suggestions || review;

        console.log(`Applying ${enhancements.length} enhancements to: ${presentationId}\n`);

        const results = await reviewer.applyEnhancements(presentationId, enhancements);

        console.log('APPLICATION RESULTS:');
        console.log('='.repeat(40));
        console.log(`Applied: ${results.summary.applied}`);
        console.log(`Failed: ${results.summary.failed}`);
        console.log(`Skipped: ${results.summary.skipped}`);

        if (results.failed.length > 0) {
          console.log('\nFailed applications:');
          results.failed.forEach(f => console.log(`  - ${f.error}`));
        }

      } catch (error) {
        console.error('Error:', error.message);
        if (verbose) console.error(error.stack);
        process.exit(1);
      }
    })();

  } else {
    console.log('Use --help for usage information');
  }
}
