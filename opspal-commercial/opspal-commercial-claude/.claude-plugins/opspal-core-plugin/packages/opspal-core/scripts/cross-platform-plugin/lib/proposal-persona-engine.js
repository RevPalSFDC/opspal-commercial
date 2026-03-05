#!/usr/bin/env node

/**
 * Proposal Persona Engine
 *
 * Detects audience persona from transcript analysis and generates
 * persona-specific content framing for proposals.
 *
 * Features:
 * - Multi-factor persona detection (title, keywords, concerns)
 * - Pain point reframing for target audience
 * - Solution messaging tailored to priorities
 * - Quote selection based on persona preferences
 *
 * @example
 * const engine = new ProposalPersonaEngine();
 * const persona = await engine.detectPersona(semanticAnalysis, stakeholders);
 * const reframed = await engine.reframePainPoints(painPoints, persona);
 */

const fs = require('fs');
const path = require('path');
const ClaudeAPIClient = require('./claude-api-client');

// Load persona definitions
const configPath = path.join(__dirname, '..', '..', 'config', 'persona-definitions.json');
const PERSONA_CONFIG = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : require('../../config/persona-definitions.json');

class ProposalPersonaEngine {
  /**
   * Initialize the persona engine
   *
   * @param {Object} options - Configuration options
   * @param {string} options.model - Claude model to use
   * @param {boolean} options.verbose - Enable verbose logging
   */
  constructor(options = {}) {
    this.client = new ClaudeAPIClient({
      model: options.model || 'claude-sonnet-4-20250514',
      verbose: options.verbose || false
    });
    this.verbose = options.verbose || false;
    this.personaConfig = PERSONA_CONFIG.personas;
    this.detectionWeights = PERSONA_CONFIG.detectionWeights;
  }

  /**
   * Detect the primary persona from semantic analysis
   *
   * @param {Object} semanticAnalysis - Output from TranscriptSemanticAnalyzer
   * @param {Array} stakeholders - Array of {name, role} stakeholders
   * @returns {Object} - Detected persona with confidence score
   */
  async detectPersona(semanticAnalysis, stakeholders) {
    this.log('Detecting audience persona...');

    // Score each persona type
    const scores = {};

    for (const [personaId, personaDef] of Object.entries(this.personaConfig)) {
      scores[personaId] = this.scorePersonaMatch(
        personaDef,
        semanticAnalysis,
        stakeholders
      );
    }

    // Find primary and secondary personas
    const sorted = Object.entries(scores)
      .sort(([, a], [, b]) => b.total - a.total);

    const [primaryId, primaryScore] = sorted[0];
    const [secondaryId, secondaryScore] = sorted[1] || [null, { total: 0 }];

    const primary = this.personaConfig[primaryId];
    const secondary = secondaryId ? this.personaConfig[secondaryId] : null;

    // Calculate confidence
    const confidence = this.calculateConfidence(primaryScore.total, secondaryScore.total);

    const result = {
      primary: primaryId,
      primaryName: primary.name,
      secondary: secondaryId,
      secondaryName: secondary?.name,
      confidence,
      decisionMaker: semanticAnalysis.stakeholderDynamics?.decisionMaker || stakeholders[0]?.name,
      framingPriorities: primary.priorities.slice(0, 3),
      tone: primary.tone,
      contentFocus: primary.contentFocus,
      scoreBreakdown: scores,
      detectionMethod: 'multi-factor'
    };

    this.log(`Detected persona: ${primary.name} (${Math.round(confidence * 100)}% confidence)`);

    return result;
  }

  /**
   * Score how well a persona matches the analysis
   */
  scorePersonaMatch(personaDef, semanticAnalysis, stakeholders) {
    const scores = {
      title: 0,
      keywords: 0,
      concerns: 0,
      total: 0
    };

    const signals = personaDef.detectionSignals;

    // Title matching
    for (const stakeholder of stakeholders) {
      const role = (stakeholder.role || '').toLowerCase();
      const name = (stakeholder.name || '').toLowerCase();

      for (const title of signals.titles) {
        if (role.includes(title.toLowerCase()) || name.includes(title.toLowerCase())) {
          scores.title += 1;
        }
      }
    }

    // Decision maker title check
    const decisionMaker = semanticAnalysis.stakeholderDynamics?.decisionMaker || '';
    for (const title of signals.titles) {
      if (decisionMaker.toLowerCase().includes(title.toLowerCase())) {
        scores.title += 2; // Extra weight for decision maker match
      }
    }

    // Keyword matching in pain points and context
    const allText = [
      ...(semanticAnalysis.implicitPainPoints || []).map(p => p.insight),
      ...(semanticAnalysis.implicitPainPoints || []).map(p => p.evidence),
      semanticAnalysis.stakeholderDynamics?.politicalContext || '',
      semanticAnalysis.buyingSignals?.timelineDriver || ''
    ].join(' ').toLowerCase();

    for (const keyword of signals.keywords) {
      if (allText.includes(keyword.toLowerCase())) {
        scores.keywords += 1;
      }
    }

    // Concern matching
    const concerns = [
      ...(semanticAnalysis.riskConcerns || []).map(r => r.concern),
      ...(semanticAnalysis.buyingSignals?.potentialObjections || []),
      ...(semanticAnalysis.missingInformation || [])
    ].join(' ').toLowerCase();

    for (const concern of signals.concerns) {
      if (concerns.includes(concern.toLowerCase())) {
        scores.concerns += 1;
      }
    }

    // Calculate weighted total
    const maxTitle = signals.titles.length * 3; // Max possible title score
    const maxKeywords = signals.keywords.length;
    const maxConcerns = signals.concerns.length;

    scores.total =
      (scores.title / Math.max(maxTitle, 1)) * this.detectionWeights.titleMatch +
      (scores.keywords / Math.max(maxKeywords, 1)) * this.detectionWeights.keywordMatch +
      (scores.concerns / Math.max(maxConcerns, 1)) * this.detectionWeights.concernMatch;

    return scores;
  }

  /**
   * Calculate confidence based on score gap
   */
  calculateConfidence(primaryScore, secondaryScore) {
    if (primaryScore === 0) return 0.5;

    const gap = primaryScore - secondaryScore;
    const relativeGap = gap / primaryScore;

    // Higher gap = higher confidence
    return Math.min(0.95, 0.5 + relativeGap * 0.5);
  }

  /**
   * Reframe pain points for the target persona
   *
   * @param {Array} painPoints - Original pain points
   * @param {Object} persona - Detected persona
   * @returns {Promise<Array>} - Reframed pain points
   */
  async reframePainPoints(painPoints, persona) {
    this.log(`Reframing ${painPoints.length} pain points for ${persona.primaryName}...`);

    const personaDef = this.personaConfig[persona.primary];

    // Build the reframing prompt
    const prompt = `You are rewriting pain points for a sales proposal targeted at a ${persona.primaryName}.

## TARGET AUDIENCE:
- Persona: ${persona.primaryName}
- Priorities: ${personaDef.priorities.join(', ')}
- Tone: ${personaDef.tone.style}, ${personaDef.tone.focus}
- Emphasize: ${personaDef.contentFocus.emphasize.join(', ')}
- Avoid: ${personaDef.contentFocus.minimize.join(', ')} and ${personaDef.tone.avoidance.join(', ')}

## REFRAMING GUIDANCE:
${JSON.stringify(personaDef.reframingRules.painPoints, null, 2)}

## ORIGINAL PAIN POINTS:
${painPoints.map((p, i) => `${i + 1}. ${typeof p === 'string' ? p : p.text}`).join('\n')}

## YOUR TASK:
Reframe each pain point to resonate with a ${persona.primaryName}. Make each:
- Focused on what THIS persona cares about
- Quantified where possible (hours, percentage, frequency)
- Action-oriented (implies a solution exists)
- Concise (max 80 characters)

Return a JSON array of objects with: {original, reframed, impactStatement}

The impactStatement should be a brief (one sentence) explanation of why this matters to the persona.`;

    const result = await this.client.completeJSON(prompt);

    // Ensure we have an array
    const reframed = Array.isArray(result) ? result : result.reframedPainPoints || [];

    this.log(`Reframed ${reframed.length} pain points`);

    return reframed;
  }

  /**
   * Generate persona-specific solution messaging
   *
   * @param {Object} solution - Original solution framework
   * @param {Object} persona - Detected persona
   * @param {Object} semanticAnalysis - Semantic analysis results
   * @returns {Promise<Object>} - Persona-tailored solution
   */
  async generatePersonaSpecificSolution(solution, persona, semanticAnalysis) {
    this.log(`Tailoring solution for ${persona.primaryName}...`);

    const personaDef = this.personaConfig[persona.primary];

    const prompt = `You are tailoring a solution framework for a ${persona.primaryName} audience.

## TARGET AUDIENCE:
- Persona: ${persona.primaryName}
- Priorities: ${personaDef.priorities.join(', ')}
- Key Concerns: ${semanticAnalysis.riskConcerns?.map(r => r.concern).join(', ') || 'None identified'}
- Buying Readiness: ${semanticAnalysis.buyingSignals?.readiness || 5}/10

## CURRENT SOLUTION FRAMEWORK:
${JSON.stringify(solution, null, 2)}

## REFRAMING GUIDANCE:
${JSON.stringify(personaDef.reframingRules.solutions, null, 2)}

## YOUR TASK:
Rewrite each tier's items to:
1. Emphasize benefits this persona cares about
2. Include specific outcomes they would value
3. Address their likely concerns proactively
4. Use language that resonates with their role

Return JSON with this structure:
{
  "tier1": {
    "name": "...",
    "items": ["...", "...", "..."],
    "personaValue": "Why this tier matters to ${persona.primaryName}"
  },
  "tier2": { ... },
  "tier3": { ... },
  "differentiator": "Key differentiator for this audience"
}`;

    const result = await this.client.completeJSON(prompt);

    return result;
  }

  /**
   * Rank quotes for persona relevance
   *
   * @param {Array} quotes - Array of quotes from transcript
   * @param {Object} persona - Detected persona
   * @returns {Array} - Quotes sorted by persona relevance
   */
  rankQuotesForPersona(quotes, persona) {
    const personaDef = this.personaConfig[persona.primary];
    const preferences = personaDef.quotePreferences;

    const scored = quotes.map(quote => {
      let score = 0;
      const text = quote.text.toLowerCase();

      // Positive scoring
      for (const pattern of preferences.preferredPatterns) {
        if (text.includes(pattern.toLowerCase())) {
          score += 2;
        }
      }

      // Negative scoring
      for (const pattern of preferences.avoidPatterns) {
        if (text.includes(pattern.toLowerCase())) {
          score -= 1;
        }
      }

      // Bonus for emotional impact words
      const impactWords = ['ugliest', 'worst', 'biggest', 'critical', 'impossible', 'nightmare'];
      for (const word of impactWords) {
        if (text.includes(word)) {
          score += 3;
        }
      }

      // Bonus for quantification
      if (/\d+/.test(text)) {
        score += 1;
      }

      return { ...quote, personaScore: score };
    });

    return scored.sort((a, b) => b.personaScore - a.personaScore);
  }

  /**
   * Generate executive summary tailored to persona
   *
   * @param {Object} parsed - Parsed transcript data
   * @param {Object} semanticAnalysis - Semantic analysis
   * @param {Object} persona - Detected persona
   * @returns {Promise<string>} - Persona-tailored summary
   */
  async generatePersonaSummary(parsed, semanticAnalysis, persona) {
    const personaDef = this.personaConfig[persona.primary];

    const prompt = `Write a 2-3 sentence executive summary for a ${persona.primaryName}.

## CONTEXT:
- Client: ${parsed.client.companyName}
- Primary Contact: ${persona.decisionMaker}
- Key Pain Points: ${semanticAnalysis.implicitPainPoints?.slice(0, 3).map(p => p.insight).join('; ')}
- Budget: ${parsed.budget.range || '$10-20K/month'}
- Timeline: ${parsed.timeline.startDate || 'Q1'}
- Deal Health: ${semanticAnalysis.dealHealthScore}/100

## PERSONA PRIORITIES:
${personaDef.priorities.join(', ')}

## TONE:
${personaDef.tone.style}, ${personaDef.tone.focus}

Write a compelling summary that immediately captures what matters to this ${persona.primaryName}.
Focus on ${personaDef.contentFocus.emphasize.slice(0, 2).join(' and ')}.
Keep it under 100 words.`;

    const summary = await this.client.complete(prompt, {
      maxTokens: 256,
      temperature: 0.7
    });

    return summary.trim();
  }

  /**
   * Get all available persona types
   */
  getAvailablePersonas() {
    return Object.entries(this.personaConfig).map(([id, def]) => ({
      id,
      name: def.name,
      description: def.description
    }));
  }

  /**
   * Get persona definition by ID
   */
  getPersonaDefinition(personaId) {
    return this.personaConfig[personaId] || null;
  }

  /**
   * Log message if verbose mode is enabled
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[PersonaEngine] ${message}`, data || '');
    }
  }
}

module.exports = ProposalPersonaEngine;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Proposal Persona Engine

Detects audience persona and generates persona-specific content framing.

Usage:
  node proposal-persona-engine.js --list                    List available personas
  node proposal-persona-engine.js --detect <analysis.json>  Detect persona from analysis
  node proposal-persona-engine.js --test                    Run detection test

Options:
  --verbose         Enable verbose logging
  --help            Show this help
`);
    process.exit(0);
  }

  const verbose = args.includes('--verbose');
  const engine = new ProposalPersonaEngine({ verbose });

  if (args.includes('--list')) {
    console.log('\nAvailable Personas:\n');
    for (const persona of engine.getAvailablePersonas()) {
      console.log(`  ${persona.id}: ${persona.name}`);
      console.log(`    ${persona.description}\n`);
    }
    process.exit(0);
  }

  if (args.includes('--detect')) {
    const idx = args.indexOf('--detect');
    const analysisPath = args[idx + 1];

    if (!analysisPath || !fs.existsSync(analysisPath)) {
      console.error('Error: Analysis file not found');
      process.exit(1);
    }

    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    const stakeholders = analysis.stakeholders || [];

    (async () => {
      try {
        const persona = await engine.detectPersona(analysis, stakeholders);
        console.log('\nDetected Persona:');
        console.log(JSON.stringify(persona, null, 2));
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    })();
  } else if (args.includes('--test')) {
    // Run a test with mock data
    const mockAnalysis = {
      stakeholderDynamics: {
        decisionMaker: 'Yao Choong (CEO)',
        influencers: ['Sales team leads'],
        blockers: [],
        politicalContext: 'CEO is driving the initiative'
      },
      implicitPainPoints: [
        { insight: 'Frustrated with admin response time', evidence: 'Multiple sighs', confidence: 0.8 },
        { insight: 'Pressure to show ROI to board', evidence: 'Mentioned investors twice', confidence: 0.7 }
      ],
      buyingSignals: {
        readiness: 8,
        urgencyIndicators: ['January timeline mentioned'],
        potentialObjections: ['Budget approval process'],
        timelineDriver: 'Q1 planning cycle'
      },
      riskConcerns: [
        { concern: 'Previous bad consultant experience', mitigation: 'Crawl-walk-run approach' }
      ],
      missingInformation: ['Budget approval process', 'License count']
    };

    const mockStakeholders = [
      { name: 'Yao Choong', role: 'CEO' }
    ];

    (async () => {
      try {
        console.log('Running persona detection test...\n');
        const persona = await engine.detectPersona(mockAnalysis, mockStakeholders);

        console.log('='.repeat(50));
        console.log('DETECTION RESULTS');
        console.log('='.repeat(50));
        console.log(`\nPrimary Persona: ${persona.primaryName}`);
        console.log(`Confidence: ${Math.round(persona.confidence * 100)}%`);
        console.log(`Secondary Persona: ${persona.secondaryName || 'None'}`);
        console.log(`\nFraming Priorities:`);
        persona.framingPriorities.forEach(p => console.log(`  - ${p}`));
        console.log(`\nTone: ${persona.tone.style}, ${persona.tone.focus}`);

        // Test pain point reframing
        console.log('\n' + '='.repeat(50));
        console.log('PAIN POINT REFRAMING TEST');
        console.log('='.repeat(50));

        const painPoints = [
          'High volume of admin requests',
          'Data duplication issues',
          'Missing sales activity metrics'
        ];

        const reframed = await engine.reframePainPoints(painPoints, persona);
        console.log('\nReframed Pain Points:');
        reframed.forEach((r, i) => {
          console.log(`\n${i + 1}. Original: ${r.original}`);
          console.log(`   Reframed: ${r.reframed}`);
          console.log(`   Impact: ${r.impactStatement}`);
        });

        console.log('\nAPI Usage:', engine.client.getUsageStats());

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
