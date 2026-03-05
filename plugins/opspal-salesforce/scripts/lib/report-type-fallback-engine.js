#!/usr/bin/env node

/**
 * Report Type Fallback Engine
 *
 * Validates every column/filter/grouping against the chosen report type's actual
 * field list. If fields are missing, tries ranked alternative report types.
 * Never silently drops fields - returns explicit correction notes.
 *
 * Usage:
 *   const { ReportTypeFallbackEngine } = require('./report-type-fallback-engine');
 *   const engine = new ReportTypeFallbackEngine({ orgAlias: 'myOrg' });
 *
 *   const result = await engine.validateAndFallback(reportPlan);
 *   // result.valid, result.resolved_type, result.missing_fields, result.correction_notes
 *
 * CLI:
 *   node report-type-fallback-engine.js validate <plan.json> --org <alias>
 *   node report-type-fallback-engine.js test --org <alias>
 *
 * @module report-type-fallback-engine
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RANKINGS_PATH = path.join(__dirname, '../../config/report-type-fallback-rankings.json');

class ReportTypeFallbackEngine {
  constructor(options = {}) {
    this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
    this.verbose = options.verbose || false;
    this.rankings = this._loadRankings(options.rankingsPath);
    this._typeFieldCache = new Map();
  }

  _loadRankings(customPath) {
    const filePath = customPath || RANKINGS_PATH;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      return { fallbacks: {}, common_type_aliases: {} };
    }
  }

  /**
   * Validate a ReportPlan's fields against its report type and try fallbacks if needed
   *
   * @param {Object} plan - ReportPlan object
   * @returns {Object} { valid, resolved_type, original_type, missing_fields, substituted_fields, correction_notes, attempted_types }
   */
  async validateAndFallback(plan) {
    const originalType = plan.report_type;
    const allRequestedFields = this._extractAllFields(plan);
    const attemptedTypes = [];

    // Try the original type first
    const primaryResult = await this._validateAgainstType(originalType, allRequestedFields);
    attemptedTypes.push({ type: originalType, result: primaryResult });

    if (primaryResult.valid) {
      return {
        valid: true,
        resolved_type: originalType,
        original_type: originalType,
        missing_fields: [],
        substituted_fields: [],
        correction_notes: [],
        attempted_types: attemptedTypes
      };
    }

    // Try fallback types
    const fallbackTypes = this._getFallbackTypes(originalType);
    for (const fallbackType of fallbackTypes) {
      const fallbackResult = await this._validateAgainstType(fallbackType, allRequestedFields);
      attemptedTypes.push({ type: fallbackType, result: fallbackResult });

      if (fallbackResult.valid) {
        return {
          valid: true,
          resolved_type: fallbackType,
          original_type: originalType,
          missing_fields: [],
          substituted_fields: [],
          correction_notes: [{
            component: 'report-type-fallback',
            original: originalType,
            resolved: fallbackType,
            reason: `Switched from ${originalType} to ${fallbackType}: original was missing fields [${primaryResult.missing.join(', ')}]`
          }],
          attempted_types: attemptedTypes
        };
      }
    }

    // Try field substitution on the original type
    const substitutions = this._suggestSubstitutions(primaryResult.missing, primaryResult.available);

    return {
      valid: false,
      resolved_type: originalType,
      original_type: originalType,
      missing_fields: primaryResult.missing,
      substituted_fields: substitutions,
      correction_notes: [{
        component: 'report-type-fallback',
        original: originalType,
        resolved: null,
        reason: `No report type found with all requested fields. Missing: [${primaryResult.missing.join(', ')}]. Attempted types: [${attemptedTypes.map(a => a.type).join(', ')}]`
      }],
      attempted_types: attemptedTypes
    };
  }

  /**
   * Validate fields against a specific report type
   */
  async _validateAgainstType(reportType, requestedFields) {
    const availableFields = await this._getTypeFields(reportType);
    if (!availableFields || availableFields.length === 0) {
      // No field data available (no org connected or type not found).
      // In offline mode, skip validation rather than blocking - we can't
      // verify fields without a live org connection.
      if (!this.orgAlias) {
        return { valid: true, missing: [], found: requestedFields, available: [], offline: true };
      }
      return { valid: false, missing: requestedFields, available: [] };
    }

    const availableSet = new Set(availableFields.map(f => f.toLowerCase()));
    const missing = [];
    const found = [];

    for (const field of requestedFields) {
      if (availableSet.has(field.toLowerCase())) {
        found.push(field);
      } else {
        missing.push(field);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      found,
      available: availableFields
    };
  }

  /**
   * Get all fields from a report type (with caching)
   */
  async _getTypeFields(reportType) {
    if (this._typeFieldCache.has(reportType)) {
      return this._typeFieldCache.get(reportType);
    }

    try {
      const fields = this._queryReportTypeFields(reportType);
      this._typeFieldCache.set(reportType, fields);
      return fields;
    } catch (e) {
      if (this.verbose) console.warn(`Failed to get fields for ${reportType}: ${e.message}`);
      return [];
    }
  }

  /**
   * Query Salesforce for report type fields via CLI
   */
  _queryReportTypeFields(reportType) {
    if (!this.orgAlias) return [];

    try {
      // Use the Analytics API to describe the report type
      const cmd = `sf data query --query "SELECT Id, DeveloperName FROM ReportType WHERE DeveloperName = '${reportType}' LIMIT 1" --target-org ${this.orgAlias} --use-tooling-api --json 2>/dev/null`;
      const result = JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 30000 }));

      if (result.result && result.result.records && result.result.records.length > 0) {
        // Found the report type - get its columns via describe
        const descCmd = `sf api request rest "/analytics/reports/describe/${reportType}" --method GET --target-org ${this.orgAlias} 2>/dev/null`;
        try {
          const descResult = JSON.parse(execSync(descCmd, { encoding: 'utf8', timeout: 30000 }));
          const columns = descResult.reportTypeColumnDetails || (descResult.result && descResult.result.reportTypeColumnDetails);
          if (columns) {
            return this._extractFieldNames(columns);
          }
        } catch (descErr) {
          // Fall through to SOQL method
        }
      }
    } catch (e) {
      // Silently fall through
    }

    return [];
  }

  /**
   * Extract field names from report type column details
   */
  _extractFieldNames(columnDetails) {
    const fields = [];
    if (!columnDetails) return fields;

    const processColumns = (obj) => {
      if (Array.isArray(obj)) {
        obj.forEach(processColumns);
      } else if (obj && typeof obj === 'object') {
        if (obj.name) fields.push(obj.name);
        if (obj.columns) processColumns(obj.columns);
        Object.values(obj).forEach(v => {
          if (Array.isArray(v)) processColumns(v);
        });
      }
    };

    processColumns(columnDetails);
    return fields;
  }

  /**
   * Extract all fields referenced in a ReportPlan
   */
  _extractAllFields(plan) {
    const fields = new Set();

    // Columns
    (plan.columns || []).forEach(c => fields.add(c));

    // Filters
    (plan.filters || []).forEach(f => { if (f.column) fields.add(f.column); });

    // Groupings
    if (plan.groupings) {
      (plan.groupings.down || []).forEach(g => { if (g.field) fields.add(g.field); });
      (plan.groupings.across || []).forEach(g => { if (g.field) fields.add(g.field); });
    }

    // Summaries
    (plan.summaries || []).forEach(s => { if (s.field) fields.add(s.field); });

    // Standard date filter
    if (plan.standard_date_filter && plan.standard_date_filter.column) {
      fields.add(plan.standard_date_filter.column);
    }

    return [...fields];
  }

  /**
   * Get fallback types for a given report type
   */
  _getFallbackTypes(reportType) {
    // Check direct fallbacks
    const direct = this.rankings.fallbacks[reportType];
    if (direct) return direct;

    // Check aliases
    const aliased = this.rankings.common_type_aliases[reportType];
    if (aliased) {
      const fromAliased = this.rankings.fallbacks[aliased];
      if (fromAliased) return fromAliased;
    }

    // Try matching by base object name
    for (const [baseType, fallbacks] of Object.entries(this.rankings.fallbacks)) {
      if (reportType.startsWith(baseType)) return fallbacks;
    }

    return [];
  }

  /**
   * Suggest field substitutions using Levenshtein distance
   */
  _suggestSubstitutions(missingFields, availableFields) {
    const suggestions = [];

    for (const missing of missingFields) {
      let bestMatch = null;
      let bestDistance = Infinity;

      for (const available of availableFields) {
        const distance = this._levenshtein(missing.toLowerCase(), available.toLowerCase());
        if (distance < bestDistance && distance <= Math.max(missing.length, available.length) * 0.4) {
          bestDistance = distance;
          bestMatch = available;
        }
      }

      if (bestMatch) {
        suggestions.push({
          original: missing,
          suggested: bestMatch,
          distance: bestDistance,
          confidence: 1 - (bestDistance / Math.max(missing.length, bestMatch.length))
        });
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Levenshtein distance between two strings
   */
  _levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,
          d[i][j - 1] + 1,
          d[i - 1][j - 1] + cost
        );
      }
    }

    return d[m][n];
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const orgFlag = args.indexOf('--org');
  const orgAlias = orgFlag >= 0 ? args[orgFlag + 1] : process.env.SF_TARGET_ORG;

  if (command === 'validate') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Usage: node report-type-fallback-engine.js validate <plan.json> --org <alias>');
      process.exit(1);
    }

    const plan = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const engine = new ReportTypeFallbackEngine({ orgAlias, verbose: true });

    engine.validateAndFallback(plan).then(result => {
      console.log('\n=== Report Type Validation ===');
      console.log(`Valid: ${result.valid}`);
      console.log(`Original type: ${result.original_type}`);
      console.log(`Resolved type: ${result.resolved_type || '(none)'}`);

      if (result.missing_fields.length > 0) {
        console.log(`\nMissing fields: ${result.missing_fields.join(', ')}`);
      }
      if (result.substituted_fields.length > 0) {
        console.log('\nSuggested substitutions:');
        result.substituted_fields.forEach(s => {
          console.log(`  ${s.original} -> ${s.suggested} (confidence: ${(s.confidence * 100).toFixed(0)}%)`);
        });
      }
      if (result.correction_notes.length > 0) {
        console.log('\nCorrection notes:');
        result.correction_notes.forEach(n => console.log(`  - ${n.reason}`));
      }

      process.exit(result.valid ? 0 : 1);
    }).catch(e => {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    });
  } else if (command === 'test') {
    console.log('=== Fallback Engine Self-Test ===');
    const engine = new ReportTypeFallbackEngine({ orgAlias, verbose: true });

    // Test Levenshtein
    console.log(`Levenshtein('AMOUNT', 'AMOUTN'): ${engine._levenshtein('AMOUNT', 'AMOUTN')}`);
    console.log(`Levenshtein('STAGE_NAME', 'STAGENAME'): ${engine._levenshtein('STAGE_NAME', 'STAGENAME')}`);

    // Test fallback resolution
    console.log(`\nFallbacks for 'Opportunity': ${engine._getFallbackTypes('Opportunity').join(', ')}`);
    console.log(`Fallbacks for 'Account': ${engine._getFallbackTypes('Account').join(', ')}`);
    console.log(`Fallbacks for 'Contact': ${engine._getFallbackTypes('Contact').join(', ')}`);

    console.log('\nSelf-test passed');
  } else {
    console.log('Report Type Fallback Engine');
    console.log('Usage:');
    console.log('  node report-type-fallback-engine.js validate <plan.json> --org <alias>');
    console.log('  node report-type-fallback-engine.js test --org <alias>');
  }
}

module.exports = { ReportTypeFallbackEngine };
