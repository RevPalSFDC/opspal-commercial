/**
 * SingletonProcessor - Enhanced handling for singleton reflections
 *
 * Singletons are reflections that don't match any existing cohort.
 * This processor:
 * - Uses lower match thresholds to find more cohort matches
 * - Detects emerging patterns (3+ similar singletons → cohort)
 * - Extracts prevention recommendations even for single issues
 * - Creates lightweight Asana tasks for high-ROI singletons
 *
 * @version 1.0.0
 * @date 2026-01-03
 */

const { createClient } = require('@supabase/supabase-js');

class SingletonProcessor {
  constructor(options = {}) {
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    this.verbose = options.verbose || false;

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('SingletonProcessor requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }

    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);

    // Configuration
    this.cohortMatchThreshold = options.cohortMatchThreshold || 0.6; // Lower than default 0.7
    this.emergingPatternThreshold = options.emergingPatternThreshold || 3;
    this.highRoiThreshold = options.highRoiThreshold || 5000; // $5,000/year
    this.lookbackDays = options.lookbackDays || 60;
  }

  /**
   * Process a singleton reflection
   * @param {object} reflection - The singleton reflection
   * @returns {object} Processing result
   */
  async processSingleton(reflection) {
    // Normalize reflection to extract data from JSONB
    const normalized = this._normalizeReflection(reflection);

    const result = {
      reflection_id: reflection.id,
      actions_taken: [],
      cohort_match: null,
      emerging_pattern: null,
      asana_task_created: false
    };

    // 1. Try to find cohort match with lower threshold
    const cohortMatch = await this._findCohortMatch(normalized);
    if (cohortMatch) {
      result.cohort_match = cohortMatch;
      result.actions_taken.push(`Matched to cohort: ${cohortMatch.cohort_id}`);

      // Update reflection with cohort assignment
      await this._assignToCohort(reflection.id, cohortMatch.cohort_id);
    }

    // 2. Check for emerging patterns
    const emergingPattern = await this._detectEmergingPattern(normalized);
    if (emergingPattern) {
      result.emerging_pattern = emergingPattern;
      result.actions_taken.push(`Emerging pattern detected: ${emergingPattern.pattern_name}`);

      // Promote singletons to cohort if pattern is strong enough
      if (emergingPattern.count >= this.emergingPatternThreshold) {
        const newCohort = await this._promoteToNewCohort(emergingPattern);
        if (newCohort) {
          result.actions_taken.push(`Created new cohort: ${newCohort.cohort_id}`);
        }
      }
    }

    // 3. Extract prevention recommendations (even for true singletons)
    const prevention = this._extractPreventionRecommendation(normalized);
    if (prevention) {
      result.prevention_recommendation = prevention;
      result.actions_taken.push('Extracted prevention recommendation');
    }

    // 4. Create Asana task for high-ROI singletons
    if (this._shouldCreateAsanaTask(normalized)) {
      result.asana_task_created = true;
      result.actions_taken.push('Flagged for Asana task creation');
    }

    if (this.verbose) {
      console.log(`[SingletonProcessor] Processed singleton ${reflection.id}: ${result.actions_taken.length} actions`);
    }

    return result;
  }

  /**
   * Find potential cohort match with lower threshold
   */
  async _findCohortMatch(reflection) {
    // Get recent cohorts
    // Note: summary is inside 'data' JSONB, focus_area is the taxonomy equivalent
    const { data: cohorts, error } = await this.supabase
      .from('reflections')
      .select('cohort_id, focus_area, data')
      .not('cohort_id', 'is', null)
      .eq('org', reflection.org)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !cohorts || cohorts.length === 0) {
      return null;
    }

    // Group by cohort and find unique cohorts
    const uniqueCohorts = new Map();
    for (const c of cohorts) {
      if (!uniqueCohorts.has(c.cohort_id)) {
        // Normalize the cohort sample to extract nested fields
        uniqueCohorts.set(c.cohort_id, this._normalizeReflection(c));
      }
    }

    // Score against each cohort
    let bestMatch = null;
    let bestScore = 0;

    const normalizedReflection = this._normalizeReflection(reflection);

    for (const [cohortId, cohortSample] of uniqueCohorts) {
      const score = this._calculateSimilarity(normalizedReflection, cohortSample);

      if (score >= this.cohortMatchThreshold && score > bestScore) {
        bestScore = score;
        bestMatch = {
          cohort_id: cohortId,
          score,
          focus_area: cohortSample.focus_area
        };
      }
    }

    return bestMatch;
  }

  /**
   * Normalize reflection data to extract nested JSONB fields
   */
  _normalizeReflection(reflection) {
    const data = reflection.data || {};
    return {
      ...reflection,
      summary: data.summary || reflection.summary || '',
      focus_area: reflection.focus_area || data.session_metadata?.focus_area || '',
      issues: data.issues || data.issues_identified || reflection.issues || [],
      playbook_created: data.playbook || reflection.playbook_created,
      roi_annual_value: reflection.roi_annual_value || data.roi_annual_value || 0
    };
  }

  /**
   * Calculate similarity between reflection and cohort sample
   * Uses focus_area (the schema's taxonomy equivalent) for categorization
   */
  _calculateSimilarity(reflection, cohortSample) {
    let score = 0;

    // Focus area match (40%) - serves as primary categorization
    if (reflection.focus_area && cohortSample.focus_area &&
        reflection.focus_area === cohortSample.focus_area) {
      score += 0.4;
    }

    // Org match bonus (10%) - same org issues often related
    if (reflection.org && cohortSample.org &&
        reflection.org === cohortSample.org) {
      score += 0.1;
    }

    // Content similarity (50%)
    const contentScore = this._textSimilarity(
      reflection.summary || '',
      cohortSample.summary || ''
    );
    score += contentScore * 0.5;

    return score;
  }

  /**
   * Simple text similarity using word overlap
   */
  _textSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    if (words1.size === 0 || words2.size === 0) {
      return 0;
    }

    let intersection = 0;
    for (const word of words1) {
      if (words2.has(word)) {
        intersection++;
      }
    }

    const union = words1.size + words2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Assign reflection to existing cohort
   */
  async _assignToCohort(reflectionId, cohortId) {
    const { error } = await this.supabase
      .from('reflections')
      .update({ cohort_id: cohortId })
      .eq('id', reflectionId);

    if (error) {
      console.error('[SingletonProcessor] Failed to assign to cohort:', error.message);
    }

    return !error;
  }

  /**
   * Detect emerging patterns among singletons
   */
  async _detectEmergingPattern(reflection) {
    // Find similar singletons in lookback window
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.lookbackDays);

    // Query using actual columns: focus_area and data JSONB
    const { data: singletons, error } = await this.supabase
      .from('reflections')
      .select('id, focus_area, data, created_at')
      .is('cohort_id', null)
      .eq('org', reflection.org)
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);

    if (error || !singletons || singletons.length < 2) {
      return null;
    }

    // Normalize all singletons to extract summary from data JSONB
    const normalizedSingletons = singletons.map(s => this._normalizeReflection(s));
    const normalizedReflection = this._normalizeReflection(reflection);

    // Group by focus_area (the schema's taxonomy equivalent)
    const groups = new Map();

    for (const s of normalizedSingletons) {
      const key = s.focus_area || 'unknown';

      if (!groups.has(key)) {
        groups.set(key, {
          focus_area: s.focus_area,
          reflections: []
        });
      }

      groups.get(key).reflections.push(s);
    }

    // Find current reflection's group
    const currentKey = normalizedReflection.focus_area || 'unknown';
    const currentGroup = groups.get(currentKey);

    if (!currentGroup || currentGroup.reflections.length < 2) {
      return null;
    }

    // Calculate content similarity within group
    const similarInGroup = currentGroup.reflections.filter(r => {
      if (r.id === reflection.id) return true;
      return this._textSimilarity(normalizedReflection.summary || '', r.summary || '') >= 0.3;
    });

    if (similarInGroup.length >= 2) {
      return {
        pattern_name: `${normalizedReflection.focus_area || 'general'}_pattern`,
        focus_area: normalizedReflection.focus_area,
        count: similarInGroup.length,
        reflection_ids: similarInGroup.map(r => r.id),
        first_seen: similarInGroup[similarInGroup.length - 1].created_at,
        last_seen: reflection.created_at
      };
    }

    return null;
  }

  /**
   * Promote emerging pattern to new cohort
   */
  async _promoteToNewCohort(pattern) {
    // Generate cohort ID using focus_area
    const focusSlug = (pattern.focus_area || 'general').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const cohortId = `cohort_${Date.now()}_${focusSlug}`;

    // Update all reflections in pattern
    const { error } = await this.supabase
      .from('reflections')
      .update({ cohort_id: cohortId })
      .in('id', pattern.reflection_ids);

    if (error) {
      console.error('[SingletonProcessor] Failed to promote to cohort:', error.message);
      return null;
    }

    if (this.verbose) {
      console.log(`[SingletonProcessor] Created new cohort ${cohortId} with ${pattern.count} reflections`);
    }

    return {
      cohort_id: cohortId,
      count: pattern.count,
      focus_area: pattern.focus_area
    };
  }

  /**
   * Extract prevention recommendation from singleton
   */
  _extractPreventionRecommendation(reflection) {
    // Normalize to extract data from JSONB
    const normalized = this._normalizeReflection(reflection);

    // Check if reflection has issues with agnostic_fix or minimal_patch
    const issues = normalized.issues || [];
    const recommendations = [];

    for (const issue of issues) {
      if (issue.agnostic_fix) {
        recommendations.push({
          type: 'agnostic_fix',
          description: issue.agnostic_fix,
          priority: issue.priority || 'P2',
          blast_radius: issue.blast_radius || 'MEDIUM'
        });
      } else if (issue.minimal_patch) {
        recommendations.push({
          type: 'minimal_patch',
          description: issue.minimal_patch,
          priority: issue.priority || 'P2',
          blast_radius: issue.blast_radius || 'LOW'
        });
      }
    }

    // Also extract from playbook if present
    if (normalized.playbook_created) {
      recommendations.push({
        type: 'playbook',
        description: `Playbook created: ${normalized.playbook_created.name || 'Unknown'}`,
        trigger: normalized.playbook_created.trigger
      });
    }

    return recommendations.length > 0 ? recommendations : null;
  }

  /**
   * Check if singleton should get an Asana task
   */
  _shouldCreateAsanaTask(reflection) {
    // Normalize to get proper roi and issues from data JSONB
    const normalized = this._normalizeReflection(reflection);

    // High ROI threshold - use roi_annual_value (the actual column name)
    if ((normalized.roi_annual_value || 0) >= this.highRoiThreshold) {
      return true;
    }

    // P0/P1 issues
    const issues = normalized.issues || [];
    const hasHighPriority = issues.some(i => i.priority === 'P0' || i.priority === 'P1');
    if (hasHighPriority) {
      return true;
    }

    // HIGH blast radius
    const hasHighBlast = issues.some(i =>
      i.blast_radius === 'HIGH' || i.blast_radius === 'CRITICAL'
    );
    if (hasHighBlast) {
      return true;
    }

    return false;
  }

  /**
   * Get singletons report
   * @param {object} filters - Optional filters
   */
  async getSingletonsReport(filters = {}) {
    let query = this.supabase
      .from('reflections')
      .select('*')
      .is('cohort_id', null)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (filters.org) {
      query = query.eq('org', filters.org);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data: singletons, error } = await query;

    if (error) {
      console.error('[SingletonProcessor] Query error:', error.message);
      return null;
    }

    // Normalize all singletons to extract data from JSONB
    const normalizedSingletons = singletons.map(s => this._normalizeReflection(s));

    // Calculate statistics using focus_area (the schema's taxonomy equivalent)
    const stats = {
      total: normalizedSingletons.length,
      by_focus_area: {},
      high_roi: [],
      high_priority: [],
      potential_patterns: []
    };

    for (const s of normalizedSingletons) {
      // By focus area (replaces taxonomy/prevention)
      const focus = s.focus_area || 'unknown';
      stats.by_focus_area[focus] = (stats.by_focus_area[focus] || 0) + 1;

      // High ROI - use roi_annual_value (actual column name)
      if ((s.roi_annual_value || 0) >= this.highRoiThreshold) {
        stats.high_roi.push({
          id: s.id,
          summary: (s.summary || '').substring(0, 100),
          roi: s.roi_annual_value
        });
      }

      // High priority
      const issues = s.issues || [];
      if (issues.some(i => i.priority === 'P0' || i.priority === 'P1')) {
        stats.high_priority.push({
          id: s.id,
          summary: (s.summary || '').substring(0, 100),
          priorities: issues.map(i => i.priority).filter(Boolean)
        });
      }
    }

    // Find potential patterns (2+ in same focus area)
    for (const [key, count] of Object.entries(stats.by_focus_area)) {
      if (count >= 2 && key !== 'unknown') {
        stats.potential_patterns.push({
          type: 'focus_area',
          value: key,
          count
        });
      }
    }

    return {
      stats,
      singletons: normalizedSingletons.slice(0, 50) // Return first 50 for detail
    };
  }

  /**
   * Process all pending singletons
   * @param {object} options - Processing options
   */
  async processAllPendingSingletons(options = {}) {
    const { org, limit = 100 } = options;

    let query = this.supabase
      .from('reflections')
      .select('*')
      .is('cohort_id', null)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (org) {
      query = query.eq('org', org);
    }

    const { data: singletons, error } = await query;

    if (error) {
      console.error('[SingletonProcessor] Query error:', error.message);
      return null;
    }

    const results = {
      processed: 0,
      cohort_matches: 0,
      patterns_detected: 0,
      asana_flagged: 0
    };

    for (const singleton of singletons) {
      const result = await this.processSingleton(singleton);
      results.processed++;

      if (result.cohort_match) results.cohort_matches++;
      if (result.emerging_pattern) results.patterns_detected++;
      if (result.asana_task_created) results.asana_flagged++;
    }

    if (this.verbose) {
      console.log(`[SingletonProcessor] Processed ${results.processed} singletons`);
    }

    return results;
  }
}

module.exports = SingletonProcessor;

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  (async () => {
    const processor = new SingletonProcessor({ verbose: true });

    switch (command) {
      case 'report':
        const org = args[1];
        const report = await processor.getSingletonsReport({ org, limit: 100 });
        console.log(JSON.stringify(report, null, 2));
        break;

      case 'process':
        const processOrg = args[1];
        const limit = parseInt(args[2]) || 100;
        const results = await processor.processAllPendingSingletons({ org: processOrg, limit });
        console.log(JSON.stringify(results, null, 2));
        break;

      default:
        console.log(`
SingletonProcessor CLI

Usage:
  node singleton-processor.js report [org]         - Get singletons report
  node singleton-processor.js process [org] [lim]  - Process pending singletons

Examples:
  node singleton-processor.js report flex-production
  node singleton-processor.js process eta-corp 50
        `);
    }
  })().catch(console.error);
}
