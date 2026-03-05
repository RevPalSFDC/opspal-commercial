#!/usr/bin/env node

/**
 * Report Semantic Disambiguator
 *
 * Maps business terms to precise Salesforce report constructs.
 * Surfaces ambiguity instead of guessing. Unresolved terms block execution
 * via the ReportPlan's unresolved_semantics gate.
 *
 * Usage:
 *   const { ReportSemanticDisambiguator } = require('./report-semantic-disambiguator');
 *   const disambiguator = new ReportSemanticDisambiguator();
 *
 *   // Resolve a request
 *   const result = disambiguator.resolve("Show me churn by quarter");
 *   // result.resolved = [...], result.unresolved = [{ term, interpretations }]
 *
 *   // Apply resolved terms to a ReportPlan
 *   const plan = disambiguator.applyToPlan(plan, result.resolved);
 *
 * CLI:
 *   node report-semantic-disambiguator.js resolve "show me churn"
 *   node report-semantic-disambiguator.js list
 *   node report-semantic-disambiguator.js list --category retention
 *
 * @module report-semantic-disambiguator
 */

const fs = require('fs');
const path = require('path');

const MAPPINGS_PATH = path.join(__dirname, '../../config/business-term-mappings.json');

class ReportSemanticDisambiguator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.mappings = this._loadMappings(options.mappingsPath);
  }

  _loadMappings(customPath) {
    const filePath = customPath || MAPPINGS_PATH;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      if (this.verbose) console.warn(`Mappings load warning: ${e.message}`);
      return { terms: {} };
    }
  }

  /**
   * Resolve business terms in a user request
   * @param {string} request - Natural language request
   * @param {Object} context - Additional context for resolution
   * @returns {{ resolved: object[], unresolved: object[], matched_terms: string[] }}
   */
  resolve(request, context = {}) {
    const normalized = request.toLowerCase();
    const resolved = [];
    const unresolved = [];
    const matchedTerms = [];

    for (const [term, mapping] of Object.entries(this.mappings.terms || {})) {
      const termVariants = this._getTermVariants(term);
      const found = termVariants.some(v => normalized.includes(v));

      if (!found) continue;
      matchedTerms.push(term);

      if (!mapping.disambiguation_required || mapping.interpretations.length === 1) {
        // No ambiguity - auto-resolve to the first (or only) interpretation
        resolved.push({
          term,
          interpretation: mapping.interpretations[0],
          auto_resolved: true,
          reason: mapping.interpretations.length === 1 ? 'single_interpretation' : 'no_disambiguation_required'
        });
        continue;
      }

      // Try context-based resolution
      const contextResolved = this._tryContextResolve(term, mapping, normalized, context);
      if (contextResolved) {
        resolved.push({
          term,
          interpretation: contextResolved,
          auto_resolved: true,
          reason: 'context_match'
        });
        continue;
      }

      // Ambiguous - needs user input
      unresolved.push({
        term,
        category: mapping.category,
        interpretations: mapping.interpretations.map(interp => ({
          label: interp.label,
          object: interp.object,
          filter: interp.filter,
          metric: interp.metric
        }))
      });
    }

    return { resolved, unresolved, matched_terms: matchedTerms };
  }

  /**
   * Try to resolve ambiguity from surrounding context
   */
  _tryContextResolve(term, mapping, normalizedRequest, context) {
    // Check each interpretation's context hints against the request and context
    const scores = mapping.interpretations.map(interp => {
      let score = 0;
      const hints = interp.context_hints || [];

      for (const hint of hints) {
        if (normalizedRequest.includes(hint.toLowerCase())) {
          score += 2;
        }
        if (context.additional_context && context.additional_context.toLowerCase().includes(hint.toLowerCase())) {
          score += 1;
        }
      }

      // Check if user explicitly mentioned the object
      if (interp.object && normalizedRequest.includes(interp.object.toLowerCase())) {
        score += 3;
      }

      return { interpretation: interp, score };
    });

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Only auto-resolve if clear winner (score > 0 and at least 2 points ahead of runner-up)
    if (scores[0].score > 0) {
      const margin = scores.length > 1 ? scores[0].score - scores[1].score : scores[0].score;
      if (margin >= 2) {
        return scores[0].interpretation;
      }
    }

    return null;
  }

  /**
   * Get all variants of a term for matching
   */
  _getTermVariants(term) {
    const variants = [term.replace(/_/g, ' '), term.replace(/_/g, '-'), term];

    // Add common abbreviations/expansions
    const aliases = {
      'nrr': ['net revenue retention', 'net retention'],
      'grr': ['gross revenue retention', 'gross retention'],
      'arr': ['annual recurring revenue', 'annualized recurring'],
      'aso': ['average sale', 'average order', 'avg deal size', 'average deal'],
      'new_business': ['new business', 'new biz', 'new logo'],
      'win_rate': ['win rate', 'winrate', 'close rate by count'],
      'close_rate': ['close rate', 'closerate'],
      'sales_cycle': ['sales cycle', 'deal cycle', 'cycle length'],
      'coverage_ratio': ['coverage ratio', 'pipeline coverage', 'pipe coverage'],
      'quota_attainment': ['quota attainment', 'attainment', 'quota achievement'],
      'forecast_accuracy': ['forecast accuracy', 'forecasting accuracy'],
      'conversion_rate': ['conversion rate', 'cvr', 'convert rate']
    };

    if (aliases[term]) {
      variants.push(...aliases[term]);
    }

    return variants;
  }

  /**
   * Apply resolved terms to a ReportPlan
   */
  applyToPlan(plan, resolvedTerms) {
    const updated = JSON.parse(JSON.stringify(plan));

    for (const resolved of resolvedTerms) {
      const interp = resolved.interpretation;

      // Add assumption documenting the resolution
      if (!updated.assumptions) updated.assumptions = [];
      updated.assumptions.push(
        `"${resolved.term}" interpreted as: ${interp.label}`
      );

      // If primary_object not set and interpretation has one, suggest it
      if (!updated.primary_object && interp.object) {
        updated.primary_object = interp.object;
      }
    }

    return updated;
  }

  /**
   * Get unresolved semantics in ReportPlan format
   */
  toUnresolvedSemantics(unresolvedTerms) {
    return unresolvedTerms.map(u => ({
      term: u.term,
      interpretations: u.interpretations
    }));
  }

  /**
   * List all known business terms
   */
  listTerms(category = null) {
    const terms = [];
    for (const [term, mapping] of Object.entries(this.mappings.terms || {})) {
      if (category && mapping.category !== category) continue;
      terms.push({
        term,
        category: mapping.category,
        disambiguation_required: mapping.disambiguation_required,
        interpretation_count: mapping.interpretations.length,
        interpretations: mapping.interpretations.map(i => i.label)
      });
    }
    return terms;
  }

  /**
   * Get categories
   */
  getCategories() {
    const cats = new Set();
    for (const mapping of Object.values(this.mappings.terms || {})) {
      cats.add(mapping.category);
    }
    return [...cats].sort();
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const disambiguator = new ReportSemanticDisambiguator({ verbose: true });

  if (command === 'resolve') {
    const request = args.slice(1).join(' ');
    if (!request) {
      console.error('Usage: node report-semantic-disambiguator.js resolve "show me churn by quarter"');
      process.exit(1);
    }

    const result = disambiguator.resolve(request);

    console.log('\n=== Semantic Disambiguation ===');
    console.log(`Request: "${request}"`);
    console.log(`Matched terms: ${result.matched_terms.join(', ') || '(none)'}`);

    if (result.resolved.length > 0) {
      console.log('\nResolved:');
      result.resolved.forEach(r => {
        console.log(`  ${r.term}: ${r.interpretation.label} (${r.reason})`);
      });
    }

    if (result.unresolved.length > 0) {
      console.log('\nUnresolved (needs user input):');
      result.unresolved.forEach(u => {
        console.log(`  ${u.term}:`);
        u.interpretations.forEach((i, idx) => {
          console.log(`    ${idx + 1}. ${i.label}`);
        });
      });
    }

    process.exit(result.unresolved.length > 0 ? 1 : 0);
  } else if (command === 'list') {
    const categoryFlag = args.indexOf('--category');
    const category = categoryFlag >= 0 ? args[categoryFlag + 1] : null;

    const terms = disambiguator.listTerms(category);
    console.log(`\n=== Business Terms${category ? ` (${category})` : ''} ===`);
    console.log(`Total: ${terms.length}`);
    console.log('');
    terms.forEach(t => {
      const disambig = t.disambiguation_required ? ' [DISAMBIGUATION]' : '';
      console.log(`  ${t.term} (${t.category})${disambig}`);
      t.interpretations.forEach(i => console.log(`    - ${i}`));
    });

    console.log(`\nCategories: ${disambiguator.getCategories().join(', ')}`);
  } else {
    console.log('Report Semantic Disambiguator');
    console.log('Usage:');
    console.log('  node report-semantic-disambiguator.js resolve "show me churn by quarter"');
    console.log('  node report-semantic-disambiguator.js list');
    console.log('  node report-semantic-disambiguator.js list --category retention');
  }
}

module.exports = { ReportSemanticDisambiguator };
