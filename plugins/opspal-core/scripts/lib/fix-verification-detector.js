/**
 * FixVerificationDetector - Closed-loop verification for implemented fixes
 *
 * Detects when new reflections verify (or contradict) previously implemented fixes.
 * This enables closed-loop learning by tracking fix effectiveness.
 *
 * @version 1.0.0
 * @date 2026-01-03
 */

const { createClient } = require('@supabase/supabase-js');

class FixVerificationDetector {
  constructor(options = {}) {
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    this.verbose = options.verbose || false;

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('FixVerificationDetector requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }

    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);

    // Matching thresholds
    this.taxonomyWeight = 0.4;
    this.preventionWeight = 0.3;
    this.keywordWeight = 0.3;
    this.matchThreshold = options.matchThreshold || 0.6;

    // Regression escalation window (days)
    this.regressionWindowDays = options.regressionWindowDays || 30;
  }

  /**
   * Normalize reflection data to extract nested JSONB fields
   * @param {object} reflection - Raw reflection from database
   * @returns {object} Normalized reflection with extracted fields
   */
  _normalizeReflection(reflection) {
    const data = reflection.data || {};
    return {
      ...reflection,
      summary: data.summary || reflection.summary || '',
      focus_area: reflection.focus_area || data.session_metadata?.focus_area || '',
      issues: data.issues || data.issues_identified || reflection.issues || [],
      outcome: reflection.outcome || data.outcome || '',
      roi_annual_value: reflection.roi_annual_value || data.roi_annual_value || 0
    };
  }

  /**
   * Check if a reflection potentially verifies any implemented fixes
   * @param {object} reflection - The new reflection to check
   * @returns {Array} Array of potential fix matches with scores
   */
  async checkForRelatedFixes(reflection) {
    if (!reflection) {
      return [];
    }

    // Normalize reflection to extract nested JSONB fields
    const normalized = this._normalizeReflection(reflection);
    const org = normalized.org;

    // Query implemented fixes for this org/taxonomy
    const { data: fixes, error } = await this.supabase
      .from('fix_plans')
      .select('*')
      .eq('implementation_status', 'implemented')
      .or(`org.eq.${org},org.is.null`)
      .order('implemented_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[FixVerificationDetector] Query error:', error.message);
      return [];
    }

    if (!fixes || fixes.length === 0) {
      return [];
    }

    // Score each fix against the normalized reflection
    const matches = [];

    for (const fix of fixes) {
      const score = this._calculateMatchScore(normalized, fix);

      if (score >= this.matchThreshold) {
        matches.push({
          fix_id: fix.id,
          fix_title: fix.title,
          cohort_id: fix.cohort_id,
          implemented_at: fix.implemented_at,
          match_score: score,
          match_reasons: this._getMatchReasons(normalized, fix)
        });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.match_score - a.match_score);

    if (this.verbose && matches.length > 0) {
      console.log(`[FixVerificationDetector] Found ${matches.length} potential fix matches`);
    }

    return matches;
  }

  /**
   * Calculate match score between reflection and fix
   * Uses focus_area (from reflections) and taxonomy_category (from fix_plans) for matching
   */
  _calculateMatchScore(reflection, fix) {
    let score = 0;

    // Focus area to taxonomy match (40%)
    // The reflection uses focus_area, fix_plans may have taxonomy_category
    if (reflection.focus_area && fix.taxonomy_category) {
      // Check for overlap in terms (e.g., "metadata/configuration" matches "configuration")
      const focusTerms = reflection.focus_area.toLowerCase().split(/[\/\s_-]+/);
      const taxTerms = fix.taxonomy_category.toLowerCase().split(/[\/\s_-]+/);
      const hasOverlap = focusTerms.some(t => taxTerms.includes(t) || taxTerms.some(ft => ft.includes(t)));
      if (hasOverlap) {
        score += this.taxonomyWeight;
      }
    }

    // Org match (30%) - fixes for same org are more relevant
    if (reflection.org && fix.org && reflection.org === fix.org) {
      score += this.preventionWeight;
    }

    // Keyword/content match (30%)
    const keywordScore = this._calculateKeywordScore(reflection, fix);
    score += keywordScore * this.keywordWeight;

    return Math.round(score * 100) / 100;
  }

  /**
   * Calculate keyword-based similarity
   */
  _calculateKeywordScore(reflection, fix) {
    const reflectionText = [
      reflection.summary || '',
      reflection.description || '',
      ...(reflection.issues || []).map(i => i.root_cause || '')
    ].join(' ').toLowerCase();

    const fixText = [
      fix.title || '',
      fix.description || '',
      fix.cohort_title || ''
    ].join(' ').toLowerCase();

    // Extract significant words (remove stopwords)
    const stopwords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further',
      'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
      'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same',
      'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
      'until', 'while', 'this', 'that', 'these', 'those', 'what', 'which', 'who']);

    const extractWords = (text) => {
      return text
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopwords.has(w));
    };

    const reflectionWords = new Set(extractWords(reflectionText));
    const fixWords = new Set(extractWords(fixText));

    if (reflectionWords.size === 0 || fixWords.size === 0) {
      return 0;
    }

    // Calculate Jaccard similarity
    let intersection = 0;
    for (const word of reflectionWords) {
      if (fixWords.has(word)) {
        intersection++;
      }
    }

    const union = reflectionWords.size + fixWords.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Get human-readable match reasons
   */
  _getMatchReasons(reflection, fix) {
    const reasons = [];

    // Check focus_area to taxonomy overlap
    if (reflection.focus_area && fix.taxonomy_category) {
      const focusTerms = reflection.focus_area.toLowerCase().split(/[\/\s_-]+/);
      const taxTerms = fix.taxonomy_category.toLowerCase().split(/[\/\s_-]+/);
      const overlap = focusTerms.filter(t => taxTerms.includes(t) || taxTerms.some(ft => ft.includes(t)));
      if (overlap.length > 0) {
        reasons.push(`Related area: ${reflection.focus_area} ↔ ${fix.taxonomy_category}`);
      }
    }

    // Org match
    if (reflection.org && fix.org && reflection.org === fix.org) {
      reasons.push(`Same org: ${reflection.org}`);
    }

    // Add specific keyword matches
    const keywords = ['flow', 'trigger', 'validation', 'permission', 'field', 'api', 'query', 'cpq', 'quote', 'automation'];
    const reflectionText = (reflection.summary || '').toLowerCase();
    const fixText = (fix.title || '').toLowerCase();

    for (const kw of keywords) {
      if (reflectionText.includes(kw) && fixText.includes(kw)) {
        reasons.push(`Both mention: ${kw}`);
        break; // Only add one keyword match
      }
    }

    return reasons;
  }

  /**
   * Determine verification result based on reflection outcome
   * @param {object} reflection - The reflection
   * @returns {string} One of: fixed, partially_fixed, not_fixed, regressed
   */
  determineVerificationResult(reflection) {
    // Normalize to extract nested JSONB fields
    const normalized = this._normalizeReflection(reflection);

    // Check reflection outcome and issues
    const outcome = (normalized.outcome || '').toLowerCase();
    const issueCount = (normalized.issues || []).length;
    const hasHighPriority = (normalized.issues || []).some(i =>
      i.priority === 'P0' || i.priority === 'P1'
    );

    // Success with no issues = fix is working
    if (outcome === 'success' && issueCount === 0) {
      return 'fixed';
    }

    // Success with minor issues = partially fixed
    if (outcome === 'success' && issueCount > 0 && !hasHighPriority) {
      return 'partially_fixed';
    }

    // Partial outcome = partially fixed
    if (outcome === 'partial') {
      return 'partially_fixed';
    }

    // Same issue recurring with high priority = not fixed
    if (hasHighPriority) {
      return 'not_fixed';
    }

    // Failed outcome with issues = check if worse than before
    if (outcome === 'failure' || outcome === 'failed') {
      return 'regressed';
    }

    // Default to not_fixed for unclear cases
    return 'not_fixed';
  }

  /**
   * Record verification result
   * @param {string} reflectionId - ID of the verifying reflection
   * @param {string} fixPlanId - ID of the fix plan being verified
   * @param {string} result - Verification result
   */
  async recordVerification(reflectionId, fixPlanId, result) {
    const validResults = ['fixed', 'partially_fixed', 'not_fixed', 'regressed'];
    if (!validResults.includes(result)) {
      throw new Error(`Invalid verification result: ${result}`);
    }

    // Update reflection with verification info
    const { error: reflectionError } = await this.supabase
      .from('reflections')
      .update({
        verifies_fix_id: fixPlanId,
        verification_result: result
      })
      .eq('id', reflectionId);

    if (reflectionError) {
      console.error('[FixVerificationDetector] Failed to update reflection:', reflectionError.message);
      throw reflectionError;
    }

    // Update fix plan verification metrics
    const updateField = {
      'fixed': 'verified_fixed_count',
      'partially_fixed': 'verified_fixed_count',
      'not_fixed': 'verified_not_fixed_count',
      'regressed': 'verified_regressed_count'
    }[result];

    // Get current fix plan data
    const { data: fixPlan, error: fetchError } = await this.supabase
      .from('fix_plans')
      .select('verification_count, verified_fixed_count, verified_not_fixed_count, verified_regressed_count')
      .eq('id', fixPlanId)
      .single();

    if (fetchError) {
      console.error('[FixVerificationDetector] Failed to fetch fix plan:', fetchError.message);
      throw fetchError;
    }

    // Increment counters
    const updates = {
      verification_count: (fixPlan.verification_count || 0) + 1,
      last_verified_at: new Date().toISOString()
    };
    updates[updateField] = (fixPlan[updateField] || 0) + 1;

    const { error: updateError } = await this.supabase
      .from('fix_plans')
      .update(updates)
      .eq('id', fixPlanId);

    if (updateError) {
      console.error('[FixVerificationDetector] Failed to update fix plan:', updateError.message);
      throw updateError;
    }

    // Handle regression escalation
    if (result === 'regressed' || result === 'not_fixed') {
      await this._handleRegressionEscalation(fixPlanId, reflectionId, result);
    }

    if (this.verbose) {
      console.log(`[FixVerificationDetector] Recorded verification: ${result} for fix ${fixPlanId}`);
    }

    return { reflectionId, fixPlanId, result };
  }

  /**
   * Handle regression escalation
   */
  async _handleRegressionEscalation(fixPlanId, reflectionId, result) {
    // Get fix plan details
    const { data: fix, error } = await this.supabase
      .from('fix_plans')
      .select('*')
      .eq('id', fixPlanId)
      .single();

    if (error || !fix) {
      console.error('[FixVerificationDetector] Failed to fetch fix for escalation');
      return;
    }

    // Check regression count in window
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - this.regressionWindowDays);

    const { data: recentVerifications, error: verError } = await this.supabase
      .from('reflections')
      .select('id, verification_result')
      .eq('verifies_fix_id', fixPlanId)
      .in('verification_result', ['not_fixed', 'regressed'])
      .gte('created_at', windowStart.toISOString());

    if (verError) {
      console.error('[FixVerificationDetector] Failed to check recent verifications');
      return;
    }

    const regressionCount = (recentVerifications || []).length;

    // Escalate if multiple regressions
    if (regressionCount >= 2) {
      console.warn(`[FixVerificationDetector] ESCALATION: Fix "${fix.title}" has ${regressionCount} regressions in ${this.regressionWindowDays} days`);

      // Update fix plan status
      await this.supabase
        .from('fix_plans')
        .update({
          implementation_status: 'reverted',
          implementation_notes: `Reverted due to ${regressionCount} regressions. Last regression: ${new Date().toISOString()}`
        })
        .eq('id', fixPlanId);

      // Return escalation info for caller to handle
      return {
        type: 'REGRESSION_ESCALATION',
        fix_id: fixPlanId,
        fix_title: fix.title,
        regression_count: regressionCount,
        severity: result === 'regressed' ? 'P0' : 'P1',
        message: `Fix "${fix.title}" has regressed ${regressionCount} times and needs re-evaluation`
      };
    }
  }

  /**
   * Get fix plan effectiveness report
   * @param {object} filters - Optional filters (org, taxonomy, etc.)
   */
  async getEffectivenessReport(filters = {}) {
    let query = this.supabase
      .from('fix_plan_effectiveness')
      .select('*');

    if (filters.org) {
      query = query.eq('org', filters.org);
    }

    if (filters.taxonomy_category) {
      query = query.eq('taxonomy_category', filters.taxonomy_category);
    }

    if (filters.minVerifications) {
      query = query.gte('verification_count', filters.minVerifications);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[FixVerificationDetector] Effectiveness query error:', error.message);
      return null;
    }

    // Calculate summary stats
    const summary = {
      total_fixes: data.length,
      verified_fixes: data.filter(f => f.verification_count > 0).length,
      avg_effectiveness: 0,
      total_estimated_roi: 0,
      total_actual_roi: 0,
      by_effectiveness: {
        high: [], // >80%
        medium: [], // 50-80%
        low: [] // <50%
      }
    };

    if (data.length > 0) {
      const withVerifications = data.filter(f => f.verification_count > 0);

      if (withVerifications.length > 0) {
        summary.avg_effectiveness = Math.round(
          withVerifications.reduce((sum, f) => sum + f.effectiveness_percentage, 0) / withVerifications.length
        );
      }

      summary.total_estimated_roi = data.reduce((sum, f) => sum + (f.estimated_roi_annual || 0), 0);
      summary.total_actual_roi = data.reduce((sum, f) => sum + (f.actual_roi_annual || 0), 0);

      for (const fix of data) {
        if (fix.effectiveness_percentage >= 80) {
          summary.by_effectiveness.high.push(fix);
        } else if (fix.effectiveness_percentage >= 50) {
          summary.by_effectiveness.medium.push(fix);
        } else {
          summary.by_effectiveness.low.push(fix);
        }
      }
    }

    return {
      summary,
      fixes: data
    };
  }

  /**
   * Process a new reflection for verification
   * Main entry point for the verification workflow
   * @param {object} reflection - The new reflection to process
   * @returns {object} Verification result or null if no match
   */
  async processReflection(reflection) {
    // Find potential fix matches
    const matches = await this.checkForRelatedFixes(reflection);

    if (matches.length === 0) {
      return null;
    }

    // Use best match
    const bestMatch = matches[0];

    // Determine verification result
    const result = this.determineVerificationResult(reflection);

    // Record verification
    const verification = await this.recordVerification(
      reflection.id,
      bestMatch.fix_id,
      result
    );

    return {
      ...verification,
      match_score: bestMatch.match_score,
      match_reasons: bestMatch.match_reasons,
      fix_title: bestMatch.fix_title
    };
  }
}

module.exports = FixVerificationDetector;

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  (async () => {
    const detector = new FixVerificationDetector({ verbose: true });

    switch (command) {
      case 'report':
        const filters = {};
        if (args[1]) filters.org = args[1];

        const report = await detector.getEffectivenessReport(filters);
        console.log(JSON.stringify(report, null, 2));
        break;

      case 'check':
        if (!args[1]) {
          console.log('Usage: node fix-verification-detector.js check <reflection-id>');
          process.exit(1);
        }

        // Would need to fetch reflection by ID first
        console.log('Check command requires reflection data');
        break;

      default:
        console.log(`
FixVerificationDetector CLI

Usage:
  node fix-verification-detector.js report [org]   - Get effectiveness report
  node fix-verification-detector.js check <id>     - Check reflection for matches
        `);
    }
  })().catch(console.error);
}
