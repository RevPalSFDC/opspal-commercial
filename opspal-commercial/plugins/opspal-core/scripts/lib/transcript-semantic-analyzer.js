#!/usr/bin/env node

/**
 * Transcript Semantic Analyzer
 *
 * Uses LLM to extract deep insights from discovery call transcripts that
 * keyword-based parsing cannot capture.
 *
 * Extracts:
 * - Implicit pain points (what they're NOT saying)
 * - Stakeholder dynamics (decision maker, influencers, blockers)
 * - Buying signals and urgency level
 * - Risk concerns (spoken and unspoken)
 * - Quote relevance ranking
 * - Missing information for follow-up
 *
 * @example
 * const analyzer = new TranscriptSemanticAnalyzer();
 * const insights = await analyzer.analyze(rawTranscript, parsedData);
 */

const fs = require('fs');
const ClaudeAPIClient = require('./claude-api-client');

class TranscriptSemanticAnalyzer {
  /**
   * Initialize the semantic analyzer
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
  }

  /**
   * Analyze a transcript for semantic insights
   *
   * @param {string} rawTranscript - The full transcript text
   * @param {Object} parsedData - Output from TranscriptParser
   * @returns {Promise<Object>} - Semantic analysis results
   */
  async analyze(rawTranscript, parsedData) {
    this.log('Starting semantic analysis...');

    // Build the analysis prompt
    const prompt = this.buildAnalysisPrompt(rawTranscript, parsedData);

    // Get LLM analysis
    const schema = this.getOutputSchema();
    const analysis = await this.client.completeWithSchema(prompt, schema);

    // Validate and enrich the analysis
    const enriched = this.enrichAnalysis(analysis, parsedData);

    this.log('Semantic analysis complete');
    this.log(`Usage: ${JSON.stringify(this.client.getUsageStats())}`);

    return enriched;
  }

  /**
   * Build the analysis prompt
   */
  buildAnalysisPrompt(rawTranscript, parsed) {
    const truncatedTranscript = rawTranscript.length > 15000
      ? rawTranscript.substring(0, 15000) + '\n\n[TRANSCRIPT TRUNCATED FOR LENGTH]'
      : rawTranscript;

    return `You are an expert sales analyst reviewing a discovery call transcript to help craft a compelling proposal.

## RAW TRANSCRIPT:
${truncatedTranscript}

## ALREADY EXTRACTED (via keyword matching):
- Client: ${parsed.client.companyName}
- Primary Contact: ${parsed.client.primaryContact}
- Stakeholders: ${JSON.stringify(parsed.stakeholders)}
- Explicit Pain Points: ${JSON.stringify(parsed.painPoints.slice(0, 5).map(p => p.text))}
- Tech Stack: ${parsed.techStack.join(', ')}
- Budget Range: ${parsed.budget.range || 'Not explicitly stated'}
- Timeline: ${parsed.timeline.startDate || 'Not explicitly stated'}

## KEY QUOTES IDENTIFIED:
${parsed.keyQuotes.map((q, i) => `${i + 1}. "${q.text}" - ${q.speaker}`).join('\n')}

## YOUR TASK:
Extract deep insights that keyword matching CANNOT capture. Focus on:

1. **IMPLICIT PAIN POINTS** (3-5)
   - What problems are they experiencing but not explicitly stating?
   - What frustrations can you infer from tone, hesitations, or context?
   - What "between the lines" issues are present?

2. **STAKEHOLDER DYNAMICS**
   - Who is the decision maker? (The person who can say YES)
   - Who are the influencers? (People who shape the decision)
   - Who might be blocking this deal? (Skeptics, competing priorities)
   - What's the internal political situation?

3. **BUYING SIGNALS**
   - What indicates they're ready to buy? (urgency, specificity, commitment language)
   - What objections might they raise? (cost, timing, risk)
   - What's their urgency level? (1-10, where 10 is "need this yesterday")
   - What's driving the timeline?

4. **RISK CONCERNS**
   - What are they worried about (even if unsaid)?
   - What past failures might influence their thinking?
   - What would make them say no?
   - How can we mitigate these concerns?

5. **QUOTE RELEVANCE RANKING**
   For each quote listed above, assess its impact for an EXECUTIVE audience:
   - Rank by persuasive power (1 = most impactful)
   - Explain why each quote matters or doesn't

6. **MISSING INFORMATION**
   - What critical questions weren't answered in this call?
   - What should we ask in the next conversation?
   - What assumptions are we making that need validation?

Be specific and cite evidence from the transcript where possible.`;
  }

  /**
   * Get the JSON schema for structured output
   */
  getOutputSchema() {
    return {
      type: 'object',
      required: ['implicitPainPoints', 'stakeholderDynamics', 'buyingSignals', 'riskConcerns', 'quoteRanking', 'missingInformation'],
      properties: {
        implicitPainPoints: {
          type: 'array',
          items: {
            type: 'object',
            required: ['insight', 'evidence', 'confidence'],
            properties: {
              insight: { type: 'string' },
              evidence: { type: 'string' },
              confidence: { type: 'number' }
            }
          }
        },
        stakeholderDynamics: {
          type: 'object',
          required: ['decisionMaker', 'influencers', 'blockers', 'politicalContext'],
          properties: {
            decisionMaker: { type: 'string' },
            influencers: { type: 'array', items: { type: 'string' } },
            blockers: { type: 'array', items: { type: 'string' } },
            politicalContext: { type: 'string' }
          }
        },
        buyingSignals: {
          type: 'object',
          required: ['readiness', 'urgencyIndicators', 'potentialObjections', 'timelineDriver'],
          properties: {
            readiness: { type: 'number' },
            urgencyIndicators: { type: 'array', items: { type: 'string' } },
            potentialObjections: { type: 'array', items: { type: 'string' } },
            timelineDriver: { type: 'string' }
          }
        },
        riskConcerns: {
          type: 'array',
          items: {
            type: 'object',
            required: ['concern', 'mitigation'],
            properties: {
              concern: { type: 'string' },
              mitigation: { type: 'string' }
            }
          }
        },
        quoteRanking: {
          type: 'array',
          items: {
            type: 'object',
            required: ['quote', 'rank', 'reason'],
            properties: {
              quote: { type: 'string' },
              rank: { type: 'number' },
              reason: { type: 'string' }
            }
          }
        },
        missingInformation: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    };
  }

  /**
   * Enrich the analysis with additional computed fields
   */
  enrichAnalysis(analysis, parsedData) {
    const enriched = { ...analysis };

    // Calculate overall deal health score
    enriched.dealHealthScore = this.calculateDealHealth(analysis);

    // Identify the best quote for the proposal
    if (analysis.quoteRanking && analysis.quoteRanking.length > 0) {
      const topQuote = analysis.quoteRanking.find(q => q.rank === 1) || analysis.quoteRanking[0];
      enriched.recommendedQuote = {
        text: topQuote.quote,
        reason: topQuote.reason
      };
    }

    // Combine explicit and implicit pain points
    enriched.allPainPoints = [
      ...parsedData.painPoints.slice(0, 5).map(p => ({
        text: p.text,
        source: 'explicit',
        speaker: p.speaker
      })),
      ...analysis.implicitPainPoints.map(p => ({
        text: p.insight,
        source: 'implicit',
        evidence: p.evidence,
        confidence: p.confidence
      }))
    ];

    // Generate proposal recommendations
    enriched.proposalRecommendations = this.generateProposalRecommendations(analysis);

    // Add metadata
    enriched.metadata = {
      analyzedAt: new Date().toISOString(),
      tokenUsage: this.client.getUsageStats(),
      clientName: parsedData.client.companyName
    };

    return enriched;
  }

  /**
   * Calculate overall deal health score (0-100)
   */
  calculateDealHealth(analysis) {
    let score = 50; // Base score

    // Positive factors
    if (analysis.buyingSignals.readiness >= 7) score += 15;
    else if (analysis.buyingSignals.readiness >= 5) score += 8;

    if (analysis.buyingSignals.urgencyIndicators.length >= 2) score += 10;

    if (analysis.stakeholderDynamics.decisionMaker &&
        !analysis.stakeholderDynamics.decisionMaker.toLowerCase().includes('unknown')) {
      score += 10;
    }

    if (analysis.stakeholderDynamics.blockers.length === 0) score += 5;

    // Negative factors
    if (analysis.riskConcerns.length >= 3) score -= 10;
    if (analysis.buyingSignals.potentialObjections.length >= 3) score -= 10;
    if (analysis.stakeholderDynamics.blockers.length >= 2) score -= 10;
    if (analysis.missingInformation.length >= 4) score -= 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate proposal recommendations based on analysis
   */
  generateProposalRecommendations(analysis) {
    const recommendations = [];

    // Quote recommendation
    if (analysis.quoteRanking && analysis.quoteRanking.length > 0) {
      const top = analysis.quoteRanking.find(q => q.rank === 1);
      if (top) {
        recommendations.push({
          type: 'quote',
          action: `Feature this quote prominently: "${top.quote}"`,
          reason: top.reason
        });
      }
    }

    // Pain point framing
    if (analysis.implicitPainPoints.length > 0) {
      const highConfidence = analysis.implicitPainPoints.filter(p => p.confidence >= 0.7);
      if (highConfidence.length > 0) {
        recommendations.push({
          type: 'painPoint',
          action: `Address these implicit concerns: ${highConfidence.map(p => p.insight).join('; ')}`,
          reason: 'These are high-confidence implicit pain points'
        });
      }
    }

    // Risk mitigation
    if (analysis.riskConcerns.length > 0) {
      recommendations.push({
        type: 'risk',
        action: `Proactively address: ${analysis.riskConcerns[0].concern}`,
        reason: analysis.riskConcerns[0].mitigation
      });
    }

    // Objection handling
    if (analysis.buyingSignals.potentialObjections.length > 0) {
      recommendations.push({
        type: 'objection',
        action: `Prepare responses for: ${analysis.buyingSignals.potentialObjections.slice(0, 2).join(', ')}`,
        reason: 'Likely objections based on conversation'
      });
    }

    // Decision maker focus
    if (analysis.stakeholderDynamics.decisionMaker) {
      recommendations.push({
        type: 'stakeholder',
        action: `Ensure proposal speaks to ${analysis.stakeholderDynamics.decisionMaker}'s priorities`,
        reason: 'Identified as the decision maker'
      });
    }

    return recommendations;
  }

  /**
   * Analyze raw transcript file
   *
   * @param {string} transcriptPath - Path to transcript file
   * @param {Object} parsedData - Pre-parsed transcript data
   * @returns {Promise<Object>} - Analysis results
   */
  async analyzeFile(transcriptPath, parsedData) {
    const rawTranscript = fs.readFileSync(transcriptPath, 'utf8');
    return this.analyze(rawTranscript, parsedData);
  }

  /**
   * Log message if verbose mode is enabled
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[SemanticAnalyzer] ${message}`, data || '');
    }
  }
}

module.exports = TranscriptSemanticAnalyzer;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const TranscriptParser = require('./transcript-parser');

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
Transcript Semantic Analyzer

Extracts deep insights from discovery call transcripts using LLM analysis.

Usage:
  node transcript-semantic-analyzer.js <transcript.csv> [options]

Options:
  --output <file>   Save analysis to JSON file
  --verbose         Enable verbose logging
  --help            Show this help

Example:
  node transcript-semantic-analyzer.js discovery-call.csv --verbose
  node transcript-semantic-analyzer.js call.csv --output analysis.json
`);
    process.exit(0);
  }

  const transcriptPath = args[0];
  const verbose = args.includes('--verbose');
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : null;

  if (!fs.existsSync(transcriptPath)) {
    console.error(`Error: File not found: ${transcriptPath}`);
    process.exit(1);
  }

  (async () => {
    try {
      console.log('Parsing transcript...');
      const parser = new TranscriptParser({ verbose });
      const parsed = await parser.parse(transcriptPath);

      console.log(`Client: ${parsed.client.companyName}`);
      console.log(`Stakeholders: ${parsed.stakeholders.map(s => s.name).join(', ')}`);
      console.log(`Pain points found: ${parsed.painPoints.length}`);
      console.log(`Key quotes found: ${parsed.keyQuotes.length}`);
      console.log('');

      console.log('Running semantic analysis...');
      const analyzer = new TranscriptSemanticAnalyzer({ verbose });
      const analysis = await analyzer.analyzeFile(transcriptPath, parsed);

      console.log('\n' + '='.repeat(70));
      console.log('SEMANTIC ANALYSIS RESULTS');
      console.log('='.repeat(70));

      console.log(`\nDeal Health Score: ${analysis.dealHealthScore}/100`);
      console.log(`Buying Readiness: ${analysis.buyingSignals.readiness}/10`);

      console.log('\nDecision Maker:', analysis.stakeholderDynamics.decisionMaker);
      console.log('Influencers:', analysis.stakeholderDynamics.influencers.join(', ') || 'None identified');
      console.log('Potential Blockers:', analysis.stakeholderDynamics.blockers.join(', ') || 'None identified');

      console.log('\nImplicit Pain Points:');
      for (const pain of analysis.implicitPainPoints) {
        console.log(`  - ${pain.insight} (${Math.round(pain.confidence * 100)}% confidence)`);
      }

      console.log('\nRisk Concerns:');
      for (const risk of analysis.riskConcerns) {
        console.log(`  - ${risk.concern}`);
        console.log(`    Mitigation: ${risk.mitigation}`);
      }

      console.log('\nRecommended Quote:');
      if (analysis.recommendedQuote) {
        console.log(`  "${analysis.recommendedQuote.text}"`);
        console.log(`  Why: ${analysis.recommendedQuote.reason}`);
      }

      console.log('\nMissing Information (ask in follow-up):');
      for (const item of analysis.missingInformation.slice(0, 5)) {
        console.log(`  - ${item}`);
      }

      console.log('\nProposal Recommendations:');
      for (const rec of analysis.proposalRecommendations) {
        console.log(`  [${rec.type.toUpperCase()}] ${rec.action}`);
      }

      console.log('\n' + '='.repeat(70));
      console.log(`API Usage: ${analysis.metadata.tokenUsage.totalTokens} tokens, ~$${analysis.metadata.tokenUsage.estimatedCost}`);

      if (outputFile) {
        fs.writeFileSync(outputFile, JSON.stringify(analysis, null, 2));
        console.log(`\nFull analysis saved to: ${outputFile}`);
      }

    } catch (error) {
      console.error('Error:', error.message);
      if (verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}
