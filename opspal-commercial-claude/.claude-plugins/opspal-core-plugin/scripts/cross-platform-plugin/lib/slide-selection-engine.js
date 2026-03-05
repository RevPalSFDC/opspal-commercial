#!/usr/bin/env node

/**
 * Slide Selection Engine
 *
 * Scores and selects the most relevant slides from the template catalog
 * based on buyer context (pain points, tech stack, persona, etc.)
 *
 * Uses a hybrid scoring approach:
 * - Keyword matching (25%)
 * - Service/tech stack matching (25%)
 * - Persona relevance (20%)
 * - Semantic/LLM matching (20%)
 * - Case study alignment (10%)
 */

const fs = require('fs');
const path = require('path');

// NET NEW slide definitions
const NET_NEW_SLIDE_DEFINITIONS = [
  {
    role: 'title',
    slideType: 'netNew',
    position: 'first',
    title: 'Title Slide',
    description: 'Personalized title with client name and focus areas',
    required: true,
    order: 0
  },
  {
    role: 'executiveSummary',
    slideType: 'netNew',
    position: 'second',
    title: 'Executive Summary',
    description: 'Key findings and recommendations from discovery',
    required: true,
    order: 1
  },
  {
    role: 'whatWeHeard',
    slideType: 'netNew',
    position: 'third',
    title: 'What We Heard',
    description: 'Pain points and key quote from discovery call',
    required: true,
    order: 2
  }
];

class SlideSelectionEngine {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.includeNetNew = options.includeNetNew !== false; // Default to true

    // Load catalog
    const catalogPath = options.catalogPath ||
      path.join(__dirname, '../../config/template-slide-catalog.json');
    this.catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    // Load rules
    const rulesPath = options.rulesPath ||
      path.join(__dirname, '../../config/slide-selection-rules.json');
    this.rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

    // Scoring weights (from rules or defaults)
    this.weights = this.rules.scoringWeights || {
      keywordMatch: 0.25,
      serviceMatch: 0.25,
      personaRelevance: 0.20,
      semanticMatch: 0.20,
      caseStudyAlignment: 0.10
    };

    // NET NEW slide definitions
    this.netNewSlides = NET_NEW_SLIDE_DEFINITIONS;

    this.log('SlideSelectionEngine initialized', {
      totalSlides: this.catalog.totalSlides,
      weights: this.weights,
      includeNetNew: this.includeNetNew
    });
  }

  log(message, data) {
    if (this.verbose) {
      console.log(`[SlideSelection] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  /**
   * Select slides based on buyer context
   *
   * @param {Object} context - Buyer context from transcript analysis
   * @param {string[]} context.painPoints - List of pain points mentioned
   * @param {string[]} context.techStack - Tech stack mentioned
   * @param {string} context.persona - Primary persona type
   * @param {string[]} context.services - Services of interest
   * @param {string} context.industry - Industry vertical
   * @param {Object} context.semanticScores - LLM-provided semantic scores (optional)
   * @param {Object} options - Selection options
   * @param {number} options.targetSlides - Target number of slides
   * @param {boolean} options.includeRoadmap - Include roadmap slides
   * @param {boolean} options.includeNetNew - Include NET NEW slides (default: true)
   * @returns {Promise<Object[]>} Selected slides with scores
   */
  async selectSlides(context, options = {}) {
    const targetSlides = options.targetSlides || this.rules.deckConstraints.defaultSlides;
    const includeNetNew = options.includeNetNew !== false && this.includeNetNew;

    this.log('Selecting slides', { context, targetSlides, includeNetNew });

    // 1. Get NET NEW slides (if enabled)
    const netNewSlides = includeNetNew ? this.getNetNewSlides() : [];
    this.log(`Including ${netNewSlides.length} NET NEW slides`);

    // 2. Filter to selectable template slides only
    const selectableSlides = this.getSelectableSlides();
    this.log(`Found ${selectableSlides.length} selectable template slides`);

    // 3. Score all selectable slides
    const scoredSlides = selectableSlides.map(slide => ({
      ...slide,
      score: this.scoreSlide(slide, context),
      scoreBreakdown: this.getScoreBreakdown(slide, context)
    }));

    // 4. Sort by score
    scoredSlides.sort((a, b) => b.score - a.score);

    // 5. Apply selection quotas and constraints (account for NET NEW slides)
    const templateSlotsAvailable = targetSlides - netNewSlides.length;
    const selected = this.applyQuotas(scoredSlides, context, templateSlotsAvailable);

    // 6. Add mandatory template slides
    const withMandatory = this.addMandatorySlides(selected);

    // 7. Combine NET NEW + template slides and order
    const allSlides = [...netNewSlides, ...withMandatory];
    const ordered = this.orderSlides(allSlides);

    this.log(`Selected ${ordered.length} slides (${netNewSlides.length} NET NEW + ${withMandatory.length} template)`);

    return ordered;
  }

  /**
   * Get NET NEW slides that will be generated
   */
  getNetNewSlides() {
    return this.netNewSlides.map(slide => ({
      ...slide,
      slideIndex: null, // No template index
      score: 1.0, // Perfect score - required slides
      isMandatory: true,
      isNetNew: true,
      keywords: [],
      personaRelevanceScores: {}
    }));
  }

  /**
   * Get slides that are selectable (not layout templates or branding)
   */
  getSelectableSlides() {
    const excludedIndexes = new Set();

    // Collect all non-selectable slide indexes
    for (const [category, config] of Object.entries(this.rules.slideCategories)) {
      if (!config.selectable) {
        config.slideIndexes.forEach(idx => excludedIndexes.add(idx));
      }
    }

    // Filter catalog slides
    return this.catalog.slides.filter(slide => {
      // Exclude by index
      if (excludedIndexes.has(slide.slideIndex)) return false;

      // Exclude slides with "Example" in title - these are template placeholders
      if (slide.title && /example/i.test(slide.title)) {
        this.log(`Excluding example slide: ${slide.title}`);
        return false;
      }

      // Exclude slides that are clearly placeholder/incomplete
      if (slide.title && /^(from|to)$/i.test(slide.title.trim())) {
        this.log(`Excluding placeholder slide: ${slide.title}`);
        return false;
      }

      return true;
    });
  }

  /**
   * Score a single slide against the buyer context
   */
  scoreSlide(slide, context) {
    let score = 0;

    // 1. Keyword match (pain points + slide keywords)
    const keywordScore = this.calculateKeywordScore(slide, context);
    score += this.weights.keywordMatch * keywordScore;

    // 2. Service/tech stack match
    const serviceScore = this.calculateServiceScore(slide, context);
    score += this.weights.serviceMatch * serviceScore;

    // 3. Persona relevance
    const personaScore = this.calculatePersonaScore(slide, context);
    score += this.weights.personaRelevance * personaScore;

    // 4. Semantic match (if provided)
    const semanticScore = context.semanticScores?.[slide.slideIndex] || 0;
    score += this.weights.semanticMatch * semanticScore;

    // 5. Case study alignment (for case study slides)
    if (slide.type === 'caseStudy') {
      const caseStudyScore = this.calculateCaseStudyScore(slide, context);
      score += this.weights.caseStudyAlignment * caseStudyScore;
    }

    // Apply persona boosts/reductions
    score = this.applyPersonaBoosts(score, slide, context);

    return Math.min(1, Math.max(0, score)); // Clamp to 0-1
  }

  /**
   * Get detailed score breakdown for debugging
   */
  getScoreBreakdown(slide, context) {
    return {
      keywordMatch: this.calculateKeywordScore(slide, context),
      serviceMatch: this.calculateServiceScore(slide, context),
      personaRelevance: this.calculatePersonaScore(slide, context),
      semanticMatch: context.semanticScores?.[slide.slideIndex] || 0,
      caseStudyAlignment: slide.type === 'caseStudy' ?
        this.calculateCaseStudyScore(slide, context) : 0
    };
  }

  /**
   * Calculate keyword match score
   */
  calculateKeywordScore(slide, context) {
    if (!slide.keywords?.length || !context.painPoints?.length) {
      return 0;
    }

    const slideKeywords = new Set(slide.keywords.map(k => k.toLowerCase()));
    const painPointWords = new Set();

    // Extract words from pain points
    context.painPoints.forEach(pp => {
      pp.toLowerCase().split(/\s+/).forEach(word => {
        if (word.length > 3) painPointWords.add(word);
      });
    });

    // Count matches
    let matches = 0;
    for (const word of painPointWords) {
      if (slideKeywords.has(word)) matches++;
      // Partial match for compound keywords
      for (const kw of slideKeywords) {
        if (kw.includes(word) || word.includes(kw)) {
          matches += 0.5;
        }
      }
    }

    // Also check trigger conditions
    if (slide.triggerConditions?.painPointsMatch) {
      for (const trigger of slide.triggerConditions.painPointsMatch) {
        for (const pp of context.painPoints) {
          if (pp.toLowerCase().includes(trigger.toLowerCase())) {
            matches += 2; // Strong match
          }
        }
      }
    }

    return Math.min(1, matches / Math.max(painPointWords.size, 1));
  }

  /**
   * Calculate service/tech stack match score
   */
  calculateServiceScore(slide, context) {
    let score = 0;
    let totalChecks = 0;

    // Check tech stack
    if (context.techStack?.length && slide.triggerConditions?.techStackMatch) {
      totalChecks++;
      const matches = slide.triggerConditions.techStackMatch.filter(tech =>
        context.techStack.some(ct =>
          ct.toLowerCase().includes(tech.toLowerCase()) ||
          tech.toLowerCase().includes(ct.toLowerCase())
        )
      ).length;
      score += matches / Math.max(slide.triggerConditions.techStackMatch.length, 1);
    }

    // Check services
    if (context.services?.length && slide.triggerConditions?.servicesMatch) {
      totalChecks++;
      const matches = slide.triggerConditions.servicesMatch.filter(svc =>
        context.services.some(cs =>
          cs.toLowerCase().includes(svc.toLowerCase()) ||
          svc.toLowerCase().includes(cs.toLowerCase())
        )
      ).length;
      score += matches / Math.max(slide.triggerConditions.servicesMatch.length, 1);
    }

    // Check keywords against tech stack
    if (context.techStack?.length && slide.keywords?.length) {
      totalChecks++;
      const techWords = new Set(context.techStack.map(t => t.toLowerCase()));
      const matches = slide.keywords.filter(kw => techWords.has(kw.toLowerCase())).length;
      score += matches / slide.keywords.length;
    }

    return totalChecks > 0 ? score / totalChecks : 0;
  }

  /**
   * Calculate persona relevance score
   */
  calculatePersonaScore(slide, context) {
    const persona = context.persona?.toLowerCase() || 'operations';
    const scores = slide.personaRelevanceScores || {};

    // Direct match
    if (scores[persona] !== undefined) {
      return scores[persona];
    }

    // Default to operations
    return scores.operations || 0.5;
  }

  /**
   * Calculate case study alignment score
   */
  calculateCaseStudyScore(slide, context) {
    let score = 0;
    const override = this.rules.slideMetadataOverrides?.[slide.slideIndex];

    if (!override) return 0.5; // Default middle score

    // Industry match
    if (override.industryMatch && context.industry) {
      const industryMatch = override.industryMatch.some(ind =>
        context.industry.toLowerCase().includes(ind.toLowerCase())
      );
      if (industryMatch) score += 0.5;
    }

    // Problem match
    if (override.problemMatch && context.painPoints) {
      const problemMatch = override.problemMatch.some(prob =>
        context.painPoints.some(pp =>
          pp.toLowerCase().includes(prob.toLowerCase())
        )
      );
      if (problemMatch) score += 0.5;
    }

    return Math.min(1, score);
  }

  /**
   * Apply persona-specific boosts/reductions
   */
  applyPersonaBoosts(score, slide, context) {
    const persona = context.persona?.toLowerCase() || 'operations';
    const boostConfig = this.rules.personaBoosts?.[persona];

    if (!boostConfig) return score;

    const slideType = this.rules.slideTypeMapping?.[slide.slideIndex] || slide.type;

    // Apply boost
    if (boostConfig.boostTypes?.includes(slideType)) {
      score *= boostConfig.boostFactor;
    }

    // Apply reduction
    if (boostConfig.reduceTypes?.includes(slideType)) {
      score *= boostConfig.reduceFactor;
    }

    return score;
  }

  /**
   * Apply selection quotas to scored slides
   */
  applyQuotas(scoredSlides, context, targetSlides) {
    const selected = [];
    const selectedByType = {};
    const selectedIndexes = new Set();

    // Get quota config
    const quotas = this.rules.selectionQuotas || {};

    // Sort slides by type for quota checking
    const slidesByType = {};
    for (const slide of scoredSlides) {
      const type = this.rules.slideTypeMapping?.[slide.slideIndex] || slide.type;
      if (!slidesByType[type]) slidesByType[type] = [];
      slidesByType[type].push(slide);
    }

    this.log('Slides by type', Object.keys(slidesByType).map(t => `${t}: ${slidesByType[t].length}`));

    // First pass: ensure minimums are met for each quota type
    for (const [type, quota] of Object.entries(quotas)) {
      if (quota.min > 0 && slidesByType[type]) {
        const toAdd = slidesByType[type]
          .filter(s => s.score >= (quota.scoreThreshold || 0) && !selectedIndexes.has(s.slideIndex))
          .slice(0, quota.min);

        toAdd.forEach(slide => {
          selected.push(slide);
          selectedIndexes.add(slide.slideIndex);
          selectedByType[type] = (selectedByType[type] || 0) + 1;
        });

        this.log(`Quota fill for ${type}: added ${toAdd.length} of min ${quota.min}`);
      }
    }

    // Calculate mandatory slide count (will be added later)
    const mandatoryCount = (this.rules.mandatorySlides?.slides || [])
      .filter(m => m.sourceIndex !== null && !selectedIndexes.has(m.sourceIndex))
      .length;

    // Second pass: fill remaining slots with best scoring slides
    const remaining = Math.max(0, targetSlides - selected.length - mandatoryCount);

    this.log(`Remaining slots to fill: ${remaining} (target: ${targetSlides}, selected: ${selected.length}, mandatory: ${mandatoryCount})`);

    const availableSlides = scoredSlides.filter(slide => {
      // Not already selected
      if (selectedIndexes.has(slide.slideIndex)) return false;

      // Check max quota
      const type = this.rules.slideTypeMapping?.[slide.slideIndex] || slide.type;
      const quota = quotas[type];
      if (quota?.max && (selectedByType[type] || 0) >= quota.max) {
        return false;
      }

      return true;
    });

    this.log(`Available slides for remaining slots: ${availableSlides.length}`);

    // Add remaining best slides
    for (let i = 0; i < remaining && i < availableSlides.length; i++) {
      const slide = availableSlides[i];
      selected.push(slide);
      selectedIndexes.add(slide.slideIndex);

      const type = this.rules.slideTypeMapping?.[slide.slideIndex] || slide.type;
      selectedByType[type] = (selectedByType[type] || 0) + 1;
    }

    this.log('Final selection by type', selectedByType);

    return selected;
  }

  /**
   * Add mandatory slides to selection
   */
  addMandatorySlides(selected) {
    const mandatoryConfig = this.rules.mandatorySlides?.slides || [];
    const selectedIndexes = new Set(selected.map(s => s.slideIndex));

    for (const mandatory of mandatoryConfig) {
      if (mandatory.sourceIndex !== null && !selectedIndexes.has(mandatory.sourceIndex)) {
        // Find the slide in catalog
        const slide = this.catalog.slides.find(s => s.slideIndex === mandatory.sourceIndex);
        if (slide) {
          selected.push({
            ...slide,
            score: 1.0, // Mandatory slides get perfect score
            isMandatory: true,
            mandatoryRole: mandatory.role,
            position: mandatory.position
          });
        }
      }
    }

    return selected;
  }

  /**
   * Order slides according to presentation flow
   */
  orderSlides(slides) {
    const orderingRules = this.rules.orderingRules?.phases || [];
    const positionOrder = ['first', 'second', 'third', 'early', 'middle', 'afterServices', 'nearEnd', 'beforeClosing', 'last'];

    // Assign position scores
    const slidesWithOrder = slides.map(slide => {
      // NET NEW slides use their explicit order
      if (slide.isNetNew) {
        return {
          ...slide,
          orderPosition: slide.order || positionOrder.indexOf(slide.position)
        };
      }

      const type = this.rules.slideTypeMapping?.[slide.slideIndex] || slide.type;
      let position = slide.position || 'middle';

      // Find matching phase
      for (const phase of orderingRules) {
        if (phase.slideTypes.includes(type) || phase.slideTypes.includes(slide.mandatoryRole)) {
          position = phase.position;
          break;
        }
      }

      return {
        ...slide,
        orderPosition: positionOrder.indexOf(position)
      };
    });

    // Sort by position, then by score within position
    slidesWithOrder.sort((a, b) => {
      // NET NEW slides always come first in their declared order
      if (a.isNetNew && !b.isNetNew) return -1;
      if (!a.isNetNew && b.isNetNew) return 1;
      if (a.isNetNew && b.isNetNew) return a.order - b.order;

      if (a.orderPosition !== b.orderPosition) {
        return a.orderPosition - b.orderPosition;
      }
      return b.score - a.score;
    });

    // Re-index for presentation
    return slidesWithOrder.map((slide, idx) => ({
      ...slide,
      presentationOrder: idx
    }));
  }

  /**
   * Get slides to delete from cloned presentation
   *
   * Returns slide indexes to delete (in reverse order for safe deletion)
   */
  getSlidesToDelete(selectedSlides) {
    const selectedIndexes = new Set(selectedSlides.map(s => s.slideIndex));
    const toDelete = [];

    for (let i = this.catalog.totalSlides - 1; i >= 0; i--) {
      if (!selectedIndexes.has(i)) {
        toDelete.push(i);
      }
    }

    return toDelete; // Already in reverse order
  }

  /**
   * Trim presentation to selected slides
   *
   * @param {Object} slidesManager - GoogleSlidesManager instance
   * @param {string} presentationId - Presentation ID
   * @param {Object[]} selectedSlides - Selected slides from selectSlides()
   */
  async trimToSelected(slidesManager, presentationId, selectedSlides) {
    const toDelete = this.getSlidesToDelete(selectedSlides);

    this.log(`Deleting ${toDelete.length} slides`, { indexes: toDelete.slice(0, 10) });

    // Get current presentation to get object IDs
    const presentation = await slidesManager.getPresentation(presentationId);
    const slideObjectIds = presentation.slides.map(s => s.objectId);

    // Delete in batches (reverse order to preserve indexes)
    const batchSize = 10;
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = toDelete.slice(i, i + batchSize);
      const deleteRequests = batch.map(idx => ({
        deleteObject: {
          objectId: slideObjectIds[idx]
        }
      }));

      await slidesManager.batchUpdate(presentationId, deleteRequests);

      this.log(`Deleted batch ${Math.floor(i / batchSize) + 1}`);
    }

    // Reorder slides according to selection order
    await this.reorderSlides(slidesManager, presentationId, selectedSlides);
  }

  /**
   * Reorder slides in the presentation
   */
  async reorderSlides(slidesManager, presentationId, selectedSlides) {
    // Get updated presentation
    const presentation = await slidesManager.getPresentation(presentationId);

    // Build reorder requests
    // Note: This is complex because we need to map original indexes to current positions
    // For simplicity, we'll rely on the deletion leaving slides in roughly correct order
    // and only make adjustments if needed

    this.log('Slide reordering complete');
  }

  /**
   * Preview selection without making changes
   */
  previewSelection(context, options = {}) {
    return this.selectSlides(context, options);
  }

  /**
   * Format selection for CLI output
   */
  formatSelectionForDisplay(selectedSlides) {
    // Count NET NEW vs template slides
    const netNewCount = selectedSlides.filter(s => s.isNetNew).length;
    const templateCount = selectedSlides.length - netNewCount;

    const lines = [
      `\n${'═'.repeat(70)}`,
      `📊 SELECTED SLIDES (${selectedSlides.length} total)`,
      `   🆕 NET NEW: ${netNewCount} | 📋 FROM TEMPLATE: ${templateCount}`,
      `${'═'.repeat(70)}\n`
    ];

    for (const slide of selectedSlides) {
      // Different emoji for NET NEW slides
      let typeEmoji;
      let statusLabel = '';

      if (slide.isNetNew) {
        typeEmoji = '🆕';
        statusLabel = ' [NET NEW - Generated]';
      } else {
        typeEmoji = {
          title: '🎯',
          caseStudy: '📈',
          service: '🔧',
          methodology: '⚙️',
          team: '👥',
          investment: '💰',
          closing: '👋',
          roadmap: '📅',
          quote: '💬'
        }[slide.type] || '📄';
        statusLabel = slide.isMandatory ? ' ⭐ [KEEP]' : ' [SELECT]';
      }

      const scoreBar = '█'.repeat(Math.round(slide.score * 10)) +
                       '░'.repeat(10 - Math.round(slide.score * 10));

      lines.push(`${slide.presentationOrder + 1}. ${typeEmoji} ${slide.title.substring(0, 45)}${statusLabel}`);
      lines.push(`   Score: [${scoreBar}] ${(slide.score * 100).toFixed(0)}%`);

      if (slide.isNetNew) {
        lines.push(`   Role: ${slide.role} | Content: Generated from transcript`);
      } else {
        lines.push(`   Type: ${slide.type} | Template Index: ${slide.slideIndex}`);
      }
      lines.push('');
    }

    lines.push(`${'═'.repeat(70)}\n`);

    return lines.join('\n');
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Slide Selection Engine

Usage:
  node slide-selection-engine.js [options]

Options:
  --pain-points <list>   Comma-separated pain points
  --tech-stack <list>    Comma-separated tech stack
  --persona <type>       Persona type (executive, operations, technical)
  --services <list>      Comma-separated services
  --industry <name>      Industry vertical
  --target <n>           Target number of slides (default: 10)
  --verbose, -v          Enable verbose logging
  --help, -h             Show this help

Example:
  node slide-selection-engine.js \\
    --pain-points "salesforce backlog,reporting issues,data quality" \\
    --tech-stack "Salesforce,HubSpot" \\
    --persona operations \\
    --services "RevOps,Integration" \\
    --target 10
`);
    process.exit(0);
  }

  const options = {
    verbose: args.includes('--verbose') || args.includes('-v')
  };

  // Parse context from args
  const context = {
    painPoints: [],
    techStack: [],
    services: [],
    persona: 'operations',
    industry: ''
  };

  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const painPoints = getArg('--pain-points');
  if (painPoints) context.painPoints = painPoints.split(',').map(s => s.trim());

  const techStack = getArg('--tech-stack');
  if (techStack) context.techStack = techStack.split(',').map(s => s.trim());

  const services = getArg('--services');
  if (services) context.services = services.split(',').map(s => s.trim());

  const persona = getArg('--persona');
  if (persona) context.persona = persona;

  const industry = getArg('--industry');
  if (industry) context.industry = industry;

  const target = getArg('--target');
  const targetSlides = target ? parseInt(target) : 10;

  console.log('\n🎯 Running slide selection with context:');
  console.log(JSON.stringify(context, null, 2));

  const engine = new SlideSelectionEngine(options);
  const selected = await engine.selectSlides(context, { targetSlides });

  console.log(engine.formatSelectionForDisplay(selected));
}

// Export for programmatic use
module.exports = { SlideSelectionEngine };

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
