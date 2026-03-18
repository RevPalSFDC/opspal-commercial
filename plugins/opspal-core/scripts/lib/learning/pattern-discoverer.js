#!/usr/bin/env node

/**
 * Pattern Discoverer
 *
 * Discovers new patterns from user corrections to improve entity matching.
 * Analyzes feedback to suggest new synonyms, generic entity patterns,
 * and known entities for domain dictionaries.
 *
 * Features:
 * - Discover synonym patterns from merge corrections
 * - Identify generic entity patterns from rejection patterns
 * - Suggest known entities from multi-location merge patterns
 * - Generate dictionary update suggestions
 *
 * Usage:
 *   const { PatternDiscoverer } = require('./pattern-discoverer');
 *   const discoverer = new PatternDiscoverer();
 *
 *   // Discover patterns for a market
 *   const discoveries = discoverer.discoverPatterns('healthcare');
 *
 *   // Generate dictionary updates
 *   const updates = discoverer.generateDictionaryUpdates('healthcare');
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { FeedbackTracker } = require('./feedback-tracker');

class PatternDiscoverer {
  constructor(options = {}) {
    // Initialize feedback tracker
    this.feedbackTracker = options.feedbackTracker || new FeedbackTracker();

    // Config paths
    this.dictionaryDir = options.dictionaryDir ||
      path.join(__dirname, '..', '..', '..', 'config', 'domain-dictionaries');

    this.marketRulesPath = options.marketRulesPath ||
      path.join(__dirname, '..', '..', '..', 'config', 'market-matching-rules.json');

    // Discovery thresholds
    this.thresholds = {
      minOccurrences: options.minOccurrences || 3,  // Min times a pattern must appear
      minConfidence: options.minConfidence || 0.7,  // Min confidence in suggestion
      synonymSimilarity: options.synonymSimilarity || 0.7,  // Min similarity for synonym detection
      patternFrequency: options.patternFrequency || 0.5  // % of corrections showing pattern
    };

    // Load existing dictionaries for comparison
    this.dictionaries = {};
    this._loadDictionaries();
  }

  /**
   * Discover all patterns from user corrections for a market
   * @param {string} market - Market to analyze
   * @returns {Object} Discovered patterns
   */
  discoverPatterns(market) {
    const feedback = this._loadFeedback(market);

    if (feedback.length < this.thresholds.minOccurrences) {
      return {
        market,
        status: 'INSUFFICIENT_DATA',
        message: `Need at least ${this.thresholds.minOccurrences} corrections (have ${feedback.length})`,
        discoveries: []
      };
    }

    const discoveries = {
      market,
      status: 'ANALYZED',
      analyzedCorrections: feedback.length,
      timestamp: new Date().toISOString(),
      synonyms: this._discoverSynonyms(feedback, market),
      genericPatterns: this._discoverGenericPatterns(feedback, market),
      knownEntities: this._discoverKnownEntities(feedback, market),
      aliasPatterns: this._discoverAliases(feedback, market)
    };

    // Calculate overall discovery quality
    const totalDiscoveries = discoveries.synonyms.length +
      discoveries.genericPatterns.length +
      discoveries.knownEntities.length +
      discoveries.aliasPatterns.length;

    discoveries.summary = {
      totalDiscoveries,
      byType: {
        synonyms: discoveries.synonyms.length,
        genericPatterns: discoveries.genericPatterns.length,
        knownEntities: discoveries.knownEntities.length,
        aliasPatterns: discoveries.aliasPatterns.length
      },
      topPriority: this._prioritizeDiscoveries(discoveries)
    };

    return discoveries;
  }

  /**
   * Generate dictionary update suggestions for a market
   * @param {string} market - Market to generate updates for
   * @returns {Object} Dictionary updates ready to apply
   */
  generateDictionaryUpdates(market) {
    const discoveries = this.discoverPatterns(market);

    if (discoveries.status !== 'ANALYZED') {
      return discoveries;
    }

    const updates = {
      market,
      dictionaryFile: this._getDictionaryPath(market),
      timestamp: new Date().toISOString(),
      changes: [],
      preview: {}
    };

    // Load current dictionary
    const dictionary = this._loadDictionary(market);
    if (!dictionary) {
      updates.status = 'NO_DICTIONARY';
      updates.message = `No dictionary found for market: ${market}`;
      return updates;
    }

    // Generate synonym updates
    for (const syn of discoveries.synonyms) {
      if (syn.confidence >= this.thresholds.minConfidence) {
        updates.changes.push({
          type: 'ADD_SYNONYM',
          path: `synonyms.${syn.baseWord}`,
          value: syn.variations,
          reason: syn.reason,
          confidence: syn.confidence,
          occurrences: syn.occurrences
        });
      }
    }

    // Generate generic pattern updates
    for (const pattern of discoveries.genericPatterns) {
      if (pattern.confidence >= this.thresholds.minConfidence) {
        if (!dictionary.genericEntityPatterns?.includes(pattern.pattern)) {
          updates.changes.push({
            type: 'ADD_GENERIC_PATTERN',
            path: 'genericEntityPatterns',
            value: pattern.pattern,
            reason: pattern.reason,
            confidence: pattern.confidence,
            occurrences: pattern.occurrences
          });
        }
      }
    }

    // Generate known entity updates
    for (const entity of discoveries.knownEntities) {
      if (entity.confidence >= this.thresholds.minConfidence) {
        if (!dictionary.knownEntities?.includes(entity.name)) {
          updates.changes.push({
            type: 'ADD_KNOWN_ENTITY',
            path: 'knownEntities',
            value: entity.name,
            reason: entity.reason,
            confidence: entity.confidence,
            locations: entity.locations
          });
        }
      }
    }

    // Generate alias updates
    for (const alias of discoveries.aliasPatterns) {
      if (alias.confidence >= this.thresholds.minConfidence) {
        updates.changes.push({
          type: 'ADD_ALIAS',
          path: `knownEntityAliases.${alias.entity}`,
          value: alias.aliases,
          reason: alias.reason,
          confidence: alias.confidence
        });
      }
    }

    // Generate preview of updated dictionary
    updates.preview = this._generatePreview(dictionary, updates.changes);
    updates.status = updates.changes.length > 0 ? 'UPDATES_AVAILABLE' : 'NO_UPDATES';

    return updates;
  }

  /**
   * Apply discovered updates to dictionary (requires confirmation)
   * @param {string} market - Market to update
   * @param {Array} changeIds - IDs of changes to apply (or 'all')
   * @param {boolean} confirmed - Must be true to apply
   * @returns {Object} Result of operation
   */
  applyUpdates(market, changeIds = 'all', confirmed = false) {
    if (!confirmed) {
      return {
        success: false,
        error: 'Updates require explicit confirmation. Pass confirmed=true after review.'
      };
    }

    const updates = this.generateDictionaryUpdates(market);

    if (updates.status !== 'UPDATES_AVAILABLE') {
      return {
        success: false,
        error: updates.message || 'No updates available'
      };
    }

    // Filter changes if specific IDs provided
    const changesToApply = changeIds === 'all'
      ? updates.changes
      : updates.changes.filter((_, i) => changeIds.includes(i));

    if (changesToApply.length === 0) {
      return {
        success: false,
        error: 'No changes selected to apply'
      };
    }

    try {
      const dictionaryPath = this._getDictionaryPath(market);
      const dictionary = JSON.parse(fs.readFileSync(dictionaryPath, 'utf-8'));

      // Apply each change
      for (const change of changesToApply) {
        this._applyChange(dictionary, change);
      }

      // Add update history
      if (!dictionary.updateHistory) {
        dictionary.updateHistory = [];
      }
      dictionary.updateHistory.push({
        timestamp: new Date().toISOString(),
        source: 'pattern-discoverer',
        changesApplied: changesToApply.length,
        changes: changesToApply.map(c => ({
          type: c.type,
          path: c.path,
          confidence: c.confidence
        }))
      });

      // Save updated dictionary
      fs.writeFileSync(dictionaryPath, JSON.stringify(dictionary, null, 2));

      // Reload dictionaries
      this._loadDictionaries();

      return {
        success: true,
        market,
        changesApplied: changesToApply.length,
        changes: changesToApply
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to apply updates: ${error.message}`
      };
    }
  }

  // ========== Discovery Methods ==========

  _discoverSynonyms(feedback, market) {
    const synonymCandidates = {};

    // Focus on user corrections where they merged similar names
    const mergeCorrections = feedback.filter(
      f => (f.userAction === 'ACCEPT' || f.userAction === 'MODIFY') &&
           f.recordA?.name && f.recordB?.name
    );

    for (const correction of mergeCorrections) {
      const nameA = this._normalizeForComparison(correction.recordA.name);
      const nameB = this._normalizeForComparison(correction.recordB.name);

      // Find word-level differences
      const wordsA = nameA.split(/\s+/);
      const wordsB = nameB.split(/\s+/);

      // Look for single-word substitutions (likely synonyms)
      if (Math.abs(wordsA.length - wordsB.length) <= 1) {
        const pairs = this._findWordSubstitutions(wordsA, wordsB);

        for (const pair of pairs) {
          const key = [pair.wordA, pair.wordB].sort().join('|');
          if (!synonymCandidates[key]) {
            synonymCandidates[key] = {
              wordA: pair.wordA,
              wordB: pair.wordB,
              occurrences: 0,
              examples: []
            };
          }
          synonymCandidates[key].occurrences++;
          if (synonymCandidates[key].examples.length < 3) {
            synonymCandidates[key].examples.push({
              nameA: correction.recordA.name,
              nameB: correction.recordB.name
            });
          }
        }
      }
    }

    // Filter and format synonym suggestions
    const synonyms = [];
    for (const candidate of Object.values(synonymCandidates)) {
      if (candidate.occurrences >= this.thresholds.minOccurrences) {
        // Check if this synonym already exists in dictionary
        const existingSynonyms = this._getExistingSynonyms(market);
        const alreadyExists = this._synonymExists(
          candidate.wordA,
          candidate.wordB,
          existingSynonyms
        );

        if (!alreadyExists) {
          synonyms.push({
            baseWord: candidate.wordA,
            variations: [candidate.wordB],
            occurrences: candidate.occurrences,
            confidence: Math.min(candidate.occurrences / 10, 0.95),
            reason: `Users merged "${candidate.wordA}" with "${candidate.wordB}" ${candidate.occurrences} times`,
            examples: candidate.examples
          });
        }
      }
    }

    return synonyms.sort((a, b) => b.occurrences - a.occurrences);
  }

  _discoverGenericPatterns(feedback, market) {
    const patternCandidates = {};

    // Focus on rejections where same name was rejected (likely generic name)
    const rejections = feedback.filter(
      f => f.userAction === 'REJECT' &&
           f.originalDecision !== 'NO_MATCH' &&
           f.recordA?.name && f.recordB?.name
    );

    for (const rejection of rejections) {
      const nameA = rejection.recordA.name;
      const nameB = rejection.recordB.name;

      // Check if names are similar (potential generic pattern)
      const baseNameA = this._extractBaseName(nameA);
      const baseNameB = this._extractBaseName(nameB);

      if (this._similarity(baseNameA, baseNameB) > 0.8) {
        // This could be a generic pattern - extract the pattern
        const pattern = this._extractPattern(nameA);

        if (pattern) {
          if (!patternCandidates[pattern]) {
            patternCandidates[pattern] = {
              pattern,
              occurrences: 0,
              examples: [],
              states: new Set()
            };
          }
          patternCandidates[pattern].occurrences++;
          patternCandidates[pattern].states.add(rejection.recordA.state);
          patternCandidates[pattern].states.add(rejection.recordB.state);

          if (patternCandidates[pattern].examples.length < 3) {
            patternCandidates[pattern].examples.push({
              nameA,
              nameB,
              stateA: rejection.recordA.state,
              stateB: rejection.recordB.state
            });
          }
        }
      }
    }

    // Filter and format pattern suggestions
    const patterns = [];
    for (const candidate of Object.values(patternCandidates)) {
      if (candidate.occurrences >= this.thresholds.minOccurrences &&
          candidate.states.size >= 2) {  // Seen in multiple states
        patterns.push({
          pattern: candidate.pattern,
          occurrences: candidate.occurrences,
          statesInvolved: Array.from(candidate.states),
          confidence: Math.min(candidate.occurrences / 8, 0.9),
          reason: `Same pattern rejected as different entities in ${candidate.states.size} states`,
          examples: candidate.examples
        });
      }
    }

    return patterns.sort((a, b) => b.occurrences - a.occurrences);
  }

  _discoverKnownEntities(feedback, market) {
    const entityCandidates = {};

    // Focus on merge corrections across different locations
    const merges = feedback.filter(
      f => (f.userAction === 'ACCEPT' || f.userAction === 'MODIFY') &&
           f.recordA?.state !== f.recordB?.state &&  // Different states
           f.recordA?.name && f.recordB?.name
    );

    for (const merge of merges) {
      // Extract base company name (remove location suffixes)
      const baseName = this._extractEntityBaseName(merge.recordA.name);

      if (baseName && baseName.length > 3) {
        if (!entityCandidates[baseName]) {
          entityCandidates[baseName] = {
            name: baseName,
            occurrences: 0,
            locations: new Set(),
            variants: new Set()
          };
        }

        entityCandidates[baseName].occurrences++;
        entityCandidates[baseName].locations.add(merge.recordA.state);
        entityCandidates[baseName].locations.add(merge.recordB.state);
        entityCandidates[baseName].variants.add(merge.recordA.name);
        entityCandidates[baseName].variants.add(merge.recordB.name);
      }
    }

    // Filter and format known entity suggestions
    const entities = [];
    for (const candidate of Object.values(entityCandidates)) {
      if (candidate.occurrences >= this.thresholds.minOccurrences &&
          candidate.locations.size >= 2) {  // Present in multiple states
        entities.push({
          name: candidate.name,
          occurrences: candidate.occurrences,
          locations: Array.from(candidate.locations),
          variants: Array.from(candidate.variants).slice(0, 5),
          confidence: Math.min(candidate.occurrences / 5, 0.95),
          reason: `User merged ${candidate.occurrences} times across ${candidate.locations.size} states`
        });
      }
    }

    return entities.sort((a, b) => b.occurrences - a.occurrences);
  }

  _discoverAliases(feedback, market) {
    const aliasCandidates = {};

    // Look for merges where names differ significantly but user accepted
    const merges = feedback.filter(
      f => (f.userAction === 'ACCEPT' || f.userAction === 'MODIFY') &&
           f.recordA?.name && f.recordB?.name
    );

    for (const merge of merges) {
      const nameA = merge.recordA.name;
      const nameB = merge.recordB.name;

      // Check if these are significantly different names (not just slight variations)
      const similarity = this._similarity(
        this._normalizeForComparison(nameA),
        this._normalizeForComparison(nameB)
      );

      if (similarity < 0.6 && similarity > 0.2) {  // Different enough to be aliases
        // Determine which is more likely the "canonical" name
        const canonical = this._determineCanonicalName(nameA, nameB);
        const alias = canonical === nameA ? nameB : nameA;

        const key = this._normalizeForComparison(canonical);
        if (!aliasCandidates[key]) {
          aliasCandidates[key] = {
            entity: canonical,
            aliases: new Set(),
            occurrences: 0
          };
        }
        aliasCandidates[key].aliases.add(alias);
        aliasCandidates[key].occurrences++;
      }
    }

    // Filter and format alias suggestions
    const aliases = [];
    for (const candidate of Object.values(aliasCandidates)) {
      if (candidate.occurrences >= 2) {  // Lower threshold for aliases
        aliases.push({
          entity: candidate.entity,
          aliases: Array.from(candidate.aliases),
          occurrences: candidate.occurrences,
          confidence: Math.min(candidate.occurrences / 4, 0.85),
          reason: `User merged these as same entity ${candidate.occurrences} times`
        });
      }
    }

    return aliases.sort((a, b) => b.occurrences - a.occurrences);
  }

  // ========== Helper Methods ==========

  _loadFeedback(market) {
    const metrics = this.feedbackTracker.calculateAccuracyMetrics(market);
    // Get the raw decisions
    const allDecisions = this.feedbackTracker._loadAllDecisions({});
    return market
      ? allDecisions.filter(d => d.market === market)
      : allDecisions;
  }

  _loadDictionaries() {
    try {
      const files = fs.readdirSync(this.dictionaryDir)
        .filter(f => f.endsWith('.json'));

      for (const file of files) {
        const domain = file.replace('.json', '');
        try {
          this.dictionaries[domain] = JSON.parse(
            fs.readFileSync(path.join(this.dictionaryDir, file), 'utf-8')
          );
        } catch (e) {
          // Skip invalid files
        }
      }
    } catch (e) {
      // Directory doesn't exist
    }
  }

  _loadDictionary(market) {
    if (this.dictionaries[market]) {
      return this.dictionaries[market];
    }

    const filePath = this._getDictionaryPath(market);
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      return null;
    }
  }

  _getDictionaryPath(market) {
    return path.join(this.dictionaryDir, `${market}.json`);
  }

  _normalizeForComparison(name) {
    if (!name) return '';
    return name.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _findWordSubstitutions(wordsA, wordsB) {
    const pairs = [];
    const minLen = Math.min(wordsA.length, wordsB.length);

    for (let i = 0; i < minLen; i++) {
      if (wordsA[i] !== wordsB[i]) {
        // Check if other words match (this is a single substitution)
        const otherWordsMatch = wordsA.filter((_, j) => j !== i).join(' ') ===
                               wordsB.filter((_, j) => j !== i).join(' ');

        if (otherWordsMatch || minLen <= 2) {
          pairs.push({ wordA: wordsA[i], wordB: wordsB[i] });
        }
      }
    }

    return pairs;
  }

  _getExistingSynonyms(market) {
    const dict = this._loadDictionary(market);
    return dict?.synonyms || {};
  }

  _synonymExists(wordA, wordB, existingSynonyms) {
    for (const [base, variations] of Object.entries(existingSynonyms)) {
      const all = [base.toLowerCase(), ...variations.map(v => v.toLowerCase())];
      if (all.includes(wordA.toLowerCase()) && all.includes(wordB.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  _extractBaseName(name) {
    if (!name) return '';
    // Remove common suffixes and location indicators
    return name
      .replace(/\s*(Inc|LLC|Corp|Co|Ltd|LP|LLP)\.?$/i, '')
      .replace(/\s*-\s*\w+$/, '')  // Remove "- Location"
      .replace(/\s*\([^)]+\)$/, '')  // Remove "(State)" or "(City)"
      .trim();
  }

  _extractEntityBaseName(name) {
    if (!name) return '';
    // More aggressive extraction for entity names
    let base = name
      .replace(/\s*(Inc|LLC|Corp|Co|Ltd|LP|LLP)\.?$/i, '')
      .replace(/\s*-\s*[\w\s]+$/i, '')  // Remove location suffix
      .replace(/\s+of\s+[\w\s]+$/i, '')  // Remove "of Location"
      .replace(/\s*\([^)]+\)$/g, '')  // Remove parenthetical
      .replace(/\s*#\d+$/i, '')  // Remove store numbers
      .trim();

    return base;
  }

  _extractPattern(name) {
    // Extract a generic pattern from a name
    // e.g., "Memorial Hospital of Dallas" -> "* Hospital"

    const suffixes = [
      'Hospital', 'Medical Center', 'Health Center', 'Clinic',
      'Staffing', 'Recruiting', 'Personnel', 'Services',
      'Senior Living', 'Assisted Living', 'Memory Care',
      'Church', 'Temple', 'Mosque', 'Synagogue',
      'School', 'Academy', 'Institute', 'College', 'University',
      'Bank', 'Credit Union', 'Insurance',
      'Police Department', 'Fire Department', 'Sheriff',
      'Housing Authority', 'Water District'
    ];

    for (const suffix of suffixes) {
      if (name.toLowerCase().includes(suffix.toLowerCase())) {
        return `* ${suffix}`;
      }
    }

    return null;
  }

  _similarity(strA, strB) {
    if (!strA || !strB) return 0;
    if (strA === strB) return 1;

    const longer = strA.length > strB.length ? strA : strB;
    const shorter = strA.length > strB.length ? strB : strA;

    const longerLength = longer.length;
    if (longerLength === 0) return 1;

    const editDistance = this._levenshteinDistance(longer, shorter);
    return (longerLength - editDistance) / longerLength;
  }

  _levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  _determineCanonicalName(nameA, nameB) {
    // Prefer longer, more complete names as canonical
    const cleanA = nameA.replace(/\s+/g, ' ').trim();
    const cleanB = nameB.replace(/\s+/g, ' ').trim();

    // Prefer names without abbreviations
    const hasAbbrA = /\b[A-Z]{2,4}\b/.test(cleanA);
    const hasAbbrB = /\b[A-Z]{2,4}\b/.test(cleanB);

    if (hasAbbrA && !hasAbbrB) return cleanB;
    if (hasAbbrB && !hasAbbrA) return cleanA;

    // Prefer longer names
    return cleanA.length >= cleanB.length ? cleanA : cleanB;
  }

  _prioritizeDiscoveries(discoveries) {
    const all = [
      ...discoveries.synonyms.map(s => ({ ...s, type: 'synonym' })),
      ...discoveries.genericPatterns.map(p => ({ ...p, type: 'genericPattern' })),
      ...discoveries.knownEntities.map(e => ({ ...e, type: 'knownEntity' })),
      ...discoveries.aliasPatterns.map(a => ({ ...a, type: 'alias' }))
    ];

    // Sort by confidence * occurrences (weighted priority)
    return all
      .sort((a, b) => (b.confidence * b.occurrences) - (a.confidence * a.occurrences))
      .slice(0, 5)
      .map(d => ({
        type: d.type,
        value: d.pattern || d.name || d.baseWord || d.entity,
        confidence: d.confidence,
        occurrences: d.occurrences
      }));
  }

  _generatePreview(dictionary, changes) {
    // Deep clone dictionary
    const preview = JSON.parse(JSON.stringify(dictionary));

    // Apply changes to preview
    for (const change of changes) {
      this._applyChange(preview, change);
    }

    return preview;
  }

  _applyChange(dictionary, change) {
    switch (change.type) {
      case 'ADD_SYNONYM':
        if (!dictionary.synonyms) dictionary.synonyms = {};
        if (!dictionary.synonyms[change.value[0]]) {
          dictionary.synonyms[change.path.split('.')[1]] = change.value;
        } else {
          // Merge with existing
          const existing = dictionary.synonyms[change.path.split('.')[1]];
          for (const v of change.value) {
            if (!existing.includes(v)) existing.push(v);
          }
        }
        break;

      case 'ADD_GENERIC_PATTERN':
        if (!dictionary.genericEntityPatterns) dictionary.genericEntityPatterns = [];
        if (!dictionary.genericEntityPatterns.includes(change.value)) {
          dictionary.genericEntityPatterns.push(change.value);
        }
        break;

      case 'ADD_KNOWN_ENTITY':
        if (!dictionary.knownEntities) dictionary.knownEntities = [];
        if (!dictionary.knownEntities.includes(change.value)) {
          dictionary.knownEntities.push(change.value);
        }
        break;

      case 'ADD_ALIAS':
        if (!dictionary.knownEntityAliases) dictionary.knownEntityAliases = {};
        const entityName = change.path.split('.')[1];
        if (!dictionary.knownEntityAliases[entityName]) {
          dictionary.knownEntityAliases[entityName] = change.value;
        } else {
          // Merge with existing
          for (const alias of change.value) {
            if (!dictionary.knownEntityAliases[entityName].includes(alias)) {
              dictionary.knownEntityAliases[entityName].push(alias);
            }
          }
        }
        break;
    }
  }
}

// Export
module.exports = { PatternDiscoverer };

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const discoverer = new PatternDiscoverer();

  if (args.length === 0) {
    console.log(`
Pattern Discoverer CLI

Usage:
  node pattern-discoverer.js discover <market>         Discover patterns for a market
  node pattern-discoverer.js updates <market>          Generate dictionary updates
  node pattern-discoverer.js apply <market> [--confirm] Apply updates to dictionary
  node pattern-discoverer.js all                       Discover patterns for all markets

Examples:
  node pattern-discoverer.js discover healthcare
  node pattern-discoverer.js updates staffing
  node pattern-discoverer.js apply healthcare --confirm
  node pattern-discoverer.js all --json

Options:
  --json         Output in JSON format
  --confirm      Required for apply command
  --min-occurrences=N  Minimum pattern occurrences (default: 3)
`);
    process.exit(0);
  }

  const command = args[0];
  const jsonOutput = args.includes('--json');
  const confirmed = args.includes('--confirm');

  // Parse min-occurrences option
  const minOccArg = args.find(a => a.startsWith('--min-occurrences='));
  if (minOccArg) {
    discoverer.thresholds.minOccurrences = parseInt(minOccArg.split('=')[1], 10);
  }

  if (command === 'discover') {
    const market = args[1];
    if (!market) {
      console.error('Error: Market required');
      process.exit(1);
    }

    const discoveries = discoverer.discoverPatterns(market);

    if (jsonOutput) {
      console.log(JSON.stringify(discoveries, null, 2));
    } else {
      console.log(`\n=== Pattern Discovery: ${market} ===\n`);
      console.log(`Status: ${discoveries.status}`);
      console.log(`Analyzed Corrections: ${discoveries.analyzedCorrections || 0}`);

      if (discoveries.summary) {
        console.log(`\nDiscoveries Summary:`);
        console.log(`  Total: ${discoveries.summary.totalDiscoveries}`);
        console.log(`  Synonyms: ${discoveries.summary.byType.synonyms}`);
        console.log(`  Generic Patterns: ${discoveries.summary.byType.genericPatterns}`);
        console.log(`  Known Entities: ${discoveries.summary.byType.knownEntities}`);
        console.log(`  Aliases: ${discoveries.summary.byType.aliasPatterns}`);

        if (discoveries.summary.topPriority.length > 0) {
          console.log(`\nTop Priority Discoveries:`);
          for (const d of discoveries.summary.topPriority) {
            console.log(`  [${d.type}] ${d.value} (${(d.confidence * 100).toFixed(0)}% confidence, ${d.occurrences} occurrences)`);
          }
        }
      }

      // Show details for each type
      if (discoveries.synonyms?.length > 0) {
        console.log(`\n--- Synonym Suggestions ---`);
        for (const s of discoveries.synonyms.slice(0, 5)) {
          console.log(`  "${s.baseWord}" ↔ ${JSON.stringify(s.variations)}`);
          console.log(`    Reason: ${s.reason}`);
        }
      }

      if (discoveries.genericPatterns?.length > 0) {
        console.log(`\n--- Generic Pattern Suggestions ---`);
        for (const p of discoveries.genericPatterns.slice(0, 5)) {
          console.log(`  "${p.pattern}"`);
          console.log(`    States: ${p.statesInvolved.join(', ')}`);
          console.log(`    Reason: ${p.reason}`);
        }
      }

      if (discoveries.knownEntities?.length > 0) {
        console.log(`\n--- Known Entity Suggestions ---`);
        for (const e of discoveries.knownEntities.slice(0, 5)) {
          console.log(`  "${e.name}"`);
          console.log(`    Locations: ${e.locations.join(', ')}`);
          console.log(`    Reason: ${e.reason}`);
        }
      }

      console.log('');
    }

  } else if (command === 'updates') {
    const market = args[1];
    if (!market) {
      console.error('Error: Market required');
      process.exit(1);
    }

    const updates = discoverer.generateDictionaryUpdates(market);

    if (jsonOutput) {
      console.log(JSON.stringify(updates, null, 2));
    } else {
      console.log(`\n=== Dictionary Updates: ${market} ===\n`);
      console.log(`Status: ${updates.status}`);

      if (updates.changes && updates.changes.length > 0) {
        console.log(`\nProposed Changes (${updates.changes.length}):\n`);
        for (let i = 0; i < updates.changes.length; i++) {
          const c = updates.changes[i];
          console.log(`[${i}] ${c.type}`);
          console.log(`    Path: ${c.path}`);
          console.log(`    Value: ${JSON.stringify(c.value)}`);
          console.log(`    Confidence: ${(c.confidence * 100).toFixed(0)}%`);
          console.log(`    Reason: ${c.reason}`);
          console.log('');
        }

        console.log(`To apply these changes, run:`);
        console.log(`  node pattern-discoverer.js apply ${market} --confirm\n`);
      } else {
        console.log('\nNo updates available.\n');
      }
    }

  } else if (command === 'apply') {
    const market = args[1];
    if (!market) {
      console.error('Error: Market required');
      process.exit(1);
    }

    const result = discoverer.applyUpdates(market, 'all', confirmed);

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.success) {
        console.log(`\n=== Updates Applied: ${market} ===\n`);
        console.log(`Changes Applied: ${result.changesApplied}`);
        console.log('\nDictionary has been updated.\n');
      } else {
        console.log(`\nError: ${result.error}`);
        if (!confirmed) {
          console.log(`\nTo apply updates, add --confirm flag after reviewing:\n`);
          console.log(`  node pattern-discoverer.js updates ${market}`);
          console.log(`  node pattern-discoverer.js apply ${market} --confirm\n`);
        }
      }
    }

  } else if (command === 'all') {
    // Discover patterns for all markets with feedback
    const summary = discoverer.feedbackTracker.getSummary();
    const markets = Object.keys(summary.byMarket || {});

    if (markets.length === 0) {
      console.log('\nNo feedback data found for any market.\n');
      process.exit(0);
    }

    const allDiscoveries = {};
    for (const market of markets) {
      allDiscoveries[market] = discoverer.discoverPatterns(market);
    }

    if (jsonOutput) {
      console.log(JSON.stringify(allDiscoveries, null, 2));
    } else {
      console.log(`\n=== Pattern Discovery: All Markets ===\n`);
      console.log(`Markets with feedback: ${markets.length}\n`);

      for (const [market, discoveries] of Object.entries(allDiscoveries)) {
        console.log(`--- ${market} ---`);
        console.log(`  Status: ${discoveries.status}`);
        if (discoveries.summary) {
          console.log(`  Total Discoveries: ${discoveries.summary.totalDiscoveries}`);
        }
        console.log('');
      }
    }

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
