#!/usr/bin/env node

/**
 * Entity Hierarchy Detector
 *
 * Detects multi-location patterns in entity names and extracts base names.
 * Used by the Geographic Entity Resolver to identify same corporate entities
 * with different locations.
 *
 * Features:
 * - Extracts base name from location-suffixed names
 * - Detects parent/child patterns (e.g., "Acme - Dallas" and "Acme - Houston")
 * - Identifies known franchises and chains
 * - Recognizes store number patterns
 * - Handles regional suffixes (North, South, East, West, etc.)
 *
 * Usage:
 *   const { EntityHierarchyDetector } = require('./entity-hierarchy-detector');
 *   const detector = new EntityHierarchyDetector();
 *
 *   // Extract base name
 *   const result = detector.extractBaseName('Marriott - Dallas');
 *   // { baseName: 'Marriott', suffix: 'Dallas', pattern: 'DASH_SEPARATOR' }
 *
 *   // Detect if two names represent same entity
 *   const match = detector.detectParentChildPattern('Marriott - Dallas', 'Marriott - Houston');
 *   // { sameEntity: true, baseName: 'Marriott', confidence: 95 }
 */

'use strict';

const path = require('path');
const fs = require('fs');

class EntityHierarchyDetector {
  constructor(options = {}) {
    this.options = options;

    // Default location patterns (can be overridden via market rules)
    this.defaultPatterns = [
      {
        name: 'DASH_SEPARATOR',
        pattern: /^(.+?)\s*[-–—]\s*([A-Za-z][A-Za-z\s]+)$/,
        baseGroup: 1,
        locationGroup: 2,
        description: 'Dash separator: "Marriott - Dallas"'
      },
      {
        name: 'STATE_CODE_PAREN',
        pattern: /^(.+?)\s*\(([A-Z]{2})\)$/,
        baseGroup: 1,
        locationGroup: 2,
        description: 'State code in parentheses: "Hilton (TX)"'
      },
      {
        name: 'STORE_NUMBER_HASH',
        pattern: /^(.+?)\s*#(\d+)$/,
        baseGroup: 1,
        storeNumberGroup: 2,
        description: 'Store number with hash: "McDonald\'s #1234"'
      },
      {
        name: 'STORE_NUMBER_KEYWORD',
        pattern: /^(.+?)\s+(?:Store|Location|Branch|Unit)\s*#?(\d+)$/i,
        baseGroup: 1,
        storeNumberGroup: 2,
        description: 'Store keyword: "Target Store 1234"'
      },
      {
        name: 'REGIONAL_SUFFIX',
        pattern: /^(.+?)\s+(North|South|East|West|Central|Downtown|Uptown|Midtown|Northwest|Northeast|Southwest|Southeast)$/i,
        baseGroup: 1,
        locationGroup: 2,
        description: 'Regional suffix: "Starbucks Downtown"'
      },
      {
        name: 'LOCATION_PAREN',
        pattern: /^(.+?)\s*\(([^)]+)\)$/,
        baseGroup: 1,
        locationGroup: 2,
        description: 'Location in parentheses: "Best Buy (Downtown Austin)"'
      },
      {
        name: 'STATE_PREFIX',
        pattern: /^([A-Z]{2}):\s*(.+)$/,
        stateGroup: 1,
        baseGroup: 2,
        description: 'State prefix: "TX: Houston Fire Department"'
      },
      {
        name: 'CITY_OF',
        pattern: /^(City of|Town of|Village of|County of)\s+(.+)$/i,
        prefixGroup: 1,
        locationGroup: 2,
        description: 'Municipal prefix: "City of Portland"'
      }
    ];

    // Regional direction words
    this.regionalSuffixes = new Set([
      'north', 'south', 'east', 'west', 'central',
      'downtown', 'uptown', 'midtown',
      'northwest', 'northeast', 'southwest', 'southeast',
      'upper', 'lower', 'greater', 'metro'
    ]);

    // US State names and codes for detection
    this.stateNames = new Map([
      ['alabama', 'AL'], ['alaska', 'AK'], ['arizona', 'AZ'], ['arkansas', 'AR'],
      ['california', 'CA'], ['colorado', 'CO'], ['connecticut', 'CT'], ['delaware', 'DE'],
      ['florida', 'FL'], ['georgia', 'GA'], ['hawaii', 'HI'], ['idaho', 'ID'],
      ['illinois', 'IL'], ['indiana', 'IN'], ['iowa', 'IA'], ['kansas', 'KS'],
      ['kentucky', 'KY'], ['louisiana', 'LA'], ['maine', 'ME'], ['maryland', 'MD'],
      ['massachusetts', 'MA'], ['michigan', 'MI'], ['minnesota', 'MN'], ['mississippi', 'MS'],
      ['missouri', 'MO'], ['montana', 'MT'], ['nebraska', 'NE'], ['nevada', 'NV'],
      ['new hampshire', 'NH'], ['new jersey', 'NJ'], ['new mexico', 'NM'], ['new york', 'NY'],
      ['north carolina', 'NC'], ['north dakota', 'ND'], ['ohio', 'OH'], ['oklahoma', 'OK'],
      ['oregon', 'OR'], ['pennsylvania', 'PA'], ['rhode island', 'RI'], ['south carolina', 'SC'],
      ['south dakota', 'SD'], ['tennessee', 'TN'], ['texas', 'TX'], ['utah', 'UT'],
      ['vermont', 'VT'], ['virginia', 'VA'], ['washington', 'WA'], ['west virginia', 'WV'],
      ['wisconsin', 'WI'], ['wyoming', 'WY'], ['district of columbia', 'DC']
    ]);

    // State code to name reverse lookup
    this.stateCodes = new Set([
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID',
      'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS',
      'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
      'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
      'WI', 'WY', 'DC'
    ]);

    // Load market rules if available
    this.marketRules = this._loadMarketRules();
  }

  /**
   * Load market matching rules
   * @private
   */
  _loadMarketRules() {
    try {
      const rulesPath = path.join(__dirname, '..', '..', 'config', 'market-matching-rules.json');
      if (fs.existsSync(rulesPath)) {
        return JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
      }
    } catch (error) {
      // Silently fail - rules are optional
    }
    return null;
  }

  /**
   * Extract base name from an entity name by removing location suffixes
   * @param {string} name - Entity name to parse
   * @param {Object} options - Options including market for custom patterns
   * @returns {Object} { baseName, suffix, storeNumber, pattern, original }
   */
  extractBaseName(name, options = {}) {
    if (!name || typeof name !== 'string') {
      return {
        baseName: name || '',
        suffix: null,
        storeNumber: null,
        pattern: null,
        original: name
      };
    }

    const trimmedName = name.trim();
    const patterns = this._getPatterns(options.market);

    for (const patternDef of patterns) {
      const match = trimmedName.match(patternDef.pattern);
      if (match) {
        const result = {
          baseName: patternDef.baseGroup ? match[patternDef.baseGroup].trim() : trimmedName,
          suffix: patternDef.locationGroup ? match[patternDef.locationGroup].trim() : null,
          storeNumber: patternDef.storeNumberGroup ? match[patternDef.storeNumberGroup] : null,
          state: patternDef.stateGroup ? match[patternDef.stateGroup] : null,
          prefix: patternDef.prefixGroup ? match[patternDef.prefixGroup] : null,
          pattern: patternDef.name,
          original: trimmedName
        };

        // For municipal patterns (City of X), the location IS the base name
        if (patternDef.name === 'CITY_OF') {
          result.baseName = trimmedName;
          result.suffix = null;
          result.municipalType = result.prefix;
          result.municipalLocation = match[patternDef.locationGroup];
        }

        return result;
      }
    }

    // No pattern matched - return original as base name
    return {
      baseName: trimmedName,
      suffix: null,
      storeNumber: null,
      pattern: null,
      original: trimmedName
    };
  }

  /**
   * Detect if two entity names represent the same parent entity
   * @param {string} nameA - First entity name
   * @param {string} nameB - Second entity name
   * @param {Object} options - Options including market
   * @returns {Object} { sameEntity, baseName, confidence, reason, signals }
   */
  detectParentChildPattern(nameA, nameB, options = {}) {
    if (!nameA || !nameB) {
      return {
        sameEntity: false,
        baseName: null,
        confidence: 0,
        reason: 'Missing name(s)',
        signals: []
      };
    }

    const extractedA = this.extractBaseName(nameA, options);
    const extractedB = this.extractBaseName(nameB, options);
    const signals = [];
    let confidence = 0;

    // Check for exact base name match
    const baseNameA = this._normalizeForComparison(extractedA.baseName);
    const baseNameB = this._normalizeForComparison(extractedB.baseName);

    if (baseNameA === baseNameB) {
      confidence += 50;
      signals.push({
        type: 'BASE_NAME_MATCH',
        value: extractedA.baseName,
        weight: 50
      });

      // Both have location patterns
      if (extractedA.pattern && extractedB.pattern) {
        confidence += 25;
        signals.push({
          type: 'BOTH_HAVE_LOCATION_PATTERN',
          patternA: extractedA.pattern,
          patternB: extractedB.pattern,
          weight: 25
        });
      }

      // Both have store numbers (strong signal for franchises)
      if (extractedA.storeNumber && extractedB.storeNumber) {
        confidence += 20;
        signals.push({
          type: 'BOTH_HAVE_STORE_NUMBER',
          numberA: extractedA.storeNumber,
          numberB: extractedB.storeNumber,
          weight: 20
        });
      }

      // Different locations (expected for multi-location)
      if (extractedA.suffix && extractedB.suffix && extractedA.suffix !== extractedB.suffix) {
        confidence += 10;
        signals.push({
          type: 'DIFFERENT_LOCATIONS',
          locationA: extractedA.suffix,
          locationB: extractedB.suffix,
          weight: 10
        });
      }
    } else {
      // Calculate similarity for fuzzy matching
      const similarity = this._calculateSimilarity(baseNameA, baseNameB);
      if (similarity >= 0.90) {
        confidence += Math.round(similarity * 40);
        signals.push({
          type: 'HIGH_BASE_NAME_SIMILARITY',
          similarity: similarity,
          weight: Math.round(similarity * 40)
        });
      }
    }

    // Check for known franchise if market rules available
    if (this.marketRules && options.market) {
      const marketConfig = this.marketRules.markets[options.market];
      if (marketConfig?.knownEntities) {
        const isKnownA = this.isKnownEntity(extractedA.baseName, options.market);
        const isKnownB = this.isKnownEntity(extractedB.baseName, options.market);
        if (isKnownA && isKnownB && baseNameA === baseNameB) {
          confidence += 30;
          signals.push({
            type: 'KNOWN_MULTI_LOCATION_ENTITY',
            entity: extractedA.baseName,
            weight: 30
          });
        }
      }
    }

    // Municipal/government special handling
    if (extractedA.municipalType && extractedB.municipalType) {
      // Both are municipalities - same type + different location = different entity
      if (extractedA.municipalLocation !== extractedB.municipalLocation) {
        confidence = Math.max(0, confidence - 60);
        signals.push({
          type: 'DIFFERENT_MUNICIPALITIES',
          locationA: extractedA.municipalLocation,
          locationB: extractedB.municipalLocation,
          weight: -60
        });
      }
    }

    return {
      sameEntity: confidence >= 70,
      baseName: extractedA.baseName,
      baseNameMatch: baseNameA === baseNameB,
      confidence: Math.min(100, confidence),
      reason: this._summarizeReason(signals),
      signals,
      extractedA,
      extractedB
    };
  }

  /**
   * Check if an entity name matches a known multi-location entity
   * @param {string} name - Entity name
   * @param {string} market - Market type (franchise, retail, etc.)
   * @returns {boolean}
   */
  isKnownEntity(name, market) {
    if (!name || !market || !this.marketRules) {
      return false;
    }

    const marketConfig = this.marketRules.markets[market];
    if (!marketConfig?.knownEntities) {
      return false;
    }

    const normalizedName = this._normalizeForComparison(name);
    return marketConfig.knownEntities.some(entity => {
      const normalizedEntity = this._normalizeForComparison(entity);
      return normalizedName === normalizedEntity ||
        normalizedName.startsWith(normalizedEntity) ||
        normalizedEntity.startsWith(normalizedName);
    });
  }

  /**
   * Detect if a name matches generic entity patterns for a market
   * @param {string} name - Entity name
   * @param {string} market - Market type
   * @returns {Object} { isGeneric, matchedPattern }
   */
  detectGenericEntityPattern(name, market) {
    if (!name || !market || !this.marketRules) {
      return { isGeneric: false, matchedPattern: null };
    }

    const marketConfig = this.marketRules.markets[market];
    if (!marketConfig?.genericEntityPatterns) {
      return { isGeneric: false, matchedPattern: null };
    }

    const normalizedName = name.toLowerCase().trim();

    for (const pattern of marketConfig.genericEntityPatterns) {
      const normalizedPattern = pattern.toLowerCase();

      // Convert glob pattern to regex
      const regexPattern = normalizedPattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      const regex = new RegExp(`^${regexPattern}$`, 'i');
      if (regex.test(normalizedName)) {
        return {
          isGeneric: true,
          matchedPattern: pattern
        };
      }

      // Also check if the name IS the suffix part of the pattern (e.g., "Housing Authority" for "* Housing Authority")
      // This catches cases where there's no prefix
      if (normalizedPattern.startsWith('* ')) {
        const suffix = normalizedPattern.substring(2); // Remove "* "
        if (normalizedName === suffix || normalizedName.endsWith(' ' + suffix)) {
          return {
            isGeneric: true,
            matchedPattern: pattern
          };
        }
      }

      // Check if pattern ends with * (prefix patterns like "City of *")
      if (normalizedPattern.endsWith(' *')) {
        const prefix = normalizedPattern.substring(0, normalizedPattern.length - 2); // Remove " *"
        if (normalizedName === prefix || normalizedName.startsWith(prefix + ' ')) {
          return {
            isGeneric: true,
            matchedPattern: pattern
          };
        }
      }
    }

    return { isGeneric: false, matchedPattern: null };
  }

  /**
   * Detect state from entity name or suffix
   * @param {string} text - Text that may contain state reference
   * @returns {Object} { stateCode, stateName, source }
   */
  detectState(text) {
    if (!text) {
      return { stateCode: null, stateName: null, source: null };
    }

    const normalized = text.trim().toLowerCase();

    // Check for 2-letter state code
    if (text.length === 2 && this.stateCodes.has(text.toUpperCase())) {
      return {
        stateCode: text.toUpperCase(),
        stateName: this._getStateName(text.toUpperCase()),
        source: 'CODE'
      };
    }

    // Check for full state name
    if (this.stateNames.has(normalized)) {
      return {
        stateCode: this.stateNames.get(normalized),
        stateName: text,
        source: 'FULL_NAME'
      };
    }

    // Check if text contains a state name
    for (const [stateName, stateCode] of this.stateNames) {
      if (normalized.includes(stateName)) {
        return {
          stateCode,
          stateName,
          source: 'CONTAINED'
        };
      }
    }

    return { stateCode: null, stateName: null, source: null };
  }

  /**
   * Get patterns for a specific market or use defaults
   * @private
   */
  _getPatterns(market) {
    if (market && this.marketRules?.markets[market]?.locationPatterns) {
      // Convert market-specific patterns to our internal format
      const marketPatterns = this.marketRules.markets[market].locationPatterns.map(p => ({
        name: p.description?.split(':')[0] || 'CUSTOM',
        pattern: new RegExp(p.pattern),
        baseGroup: p.baseGroup,
        locationGroup: p.locationGroup,
        storeNumberGroup: p.storeNumberGroup,
        description: p.description
      }));
      return [...marketPatterns, ...this.defaultPatterns];
    }
    return this.defaultPatterns;
  }

  /**
   * Normalize name for comparison
   * @private
   */
  _normalizeForComparison(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/[''`]/g, "'")
      .replace(/[""]/g, '"')
      .replace(/\s+/g, ' ')
      .replace(/[.,;:!?]/g, '')
      .trim();
  }

  /**
   * Calculate Levenshtein similarity
   * @private
   */
  _calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  }

  /**
   * Get state name from code
   * @private
   */
  _getStateName(code) {
    for (const [name, c] of this.stateNames) {
      if (c === code) return name;
    }
    return null;
  }

  /**
   * Summarize reason from signals
   * @private
   */
  _summarizeReason(signals) {
    if (signals.length === 0) return 'No matching signals';

    const positiveSignals = signals.filter(s => s.weight > 0);
    const negativeSignals = signals.filter(s => s.weight < 0);

    if (positiveSignals.length === 0) {
      return negativeSignals.map(s => s.type).join(', ');
    }

    const primary = positiveSignals.sort((a, b) => b.weight - a.weight)[0];
    let reason = primary.type;

    if (positiveSignals.length > 1) {
      reason += ` + ${positiveSignals.length - 1} more signals`;
    }

    if (negativeSignals.length > 0) {
      reason += ` (${negativeSignals.length} negative)`;
    }

    return reason;
  }
}

// Export
module.exports = { EntityHierarchyDetector };

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const detector = new EntityHierarchyDetector();

  if (args.length === 0) {
    console.log(`
Entity Hierarchy Detector CLI

Usage:
  node entity-hierarchy-detector.js extract "<name>"                Extract base name
  node entity-hierarchy-detector.js compare "<name1>" "<name2>"     Compare two names
  node entity-hierarchy-detector.js known "<name>" --market <type>  Check if known entity
  node entity-hierarchy-detector.js generic "<name>" --market <type> Check generic pattern

Examples:
  node entity-hierarchy-detector.js extract "Marriott - Dallas"
  node entity-hierarchy-detector.js extract "McDonald's #1234"
  node entity-hierarchy-detector.js compare "Marriott - Dallas" "Marriott - Houston"
  node entity-hierarchy-detector.js compare "City of Portland" "City of Portland" --market government
  node entity-hierarchy-detector.js known "McDonald's" --market franchise
  node entity-hierarchy-detector.js generic "Memorial Hospital" --market healthcare
`);
    process.exit(0);
  }

  const command = args[0];
  const marketIdx = args.indexOf('--market');
  const market = marketIdx > -1 ? args[marketIdx + 1] : null;

  if (command === 'extract') {
    const name = args[1];
    const result = detector.extractBaseName(name, { market });
    console.log('\n--- Base Name Extraction ---');
    console.log(`Original: "${name}"`);
    console.log(`Base Name: "${result.baseName}"`);
    if (result.suffix) console.log(`Suffix: "${result.suffix}"`);
    if (result.storeNumber) console.log(`Store Number: "${result.storeNumber}"`);
    if (result.pattern) console.log(`Pattern: ${result.pattern}`);
    console.log('');

  } else if (command === 'compare') {
    const nameA = args[1];
    const nameB = args[2];
    const result = detector.detectParentChildPattern(nameA, nameB, { market });
    console.log('\n--- Parent/Child Pattern Detection ---');
    console.log(`Name A: "${nameA}"`);
    console.log(`Name B: "${nameB}"`);
    console.log(`Same Entity: ${result.sameEntity ? 'YES' : 'NO'}`);
    console.log(`Confidence: ${result.confidence}%`);
    console.log(`Reason: ${result.reason}`);
    if (result.signals.length > 0) {
      console.log('\nSignals:');
      result.signals.forEach(s => {
        console.log(`  ${s.weight > 0 ? '+' : ''}${s.weight}: ${s.type}`);
      });
    }
    console.log('');

  } else if (command === 'known') {
    const name = args[1];
    if (!market) {
      console.error('Error: --market required for known check');
      process.exit(1);
    }
    const isKnown = detector.isKnownEntity(name, market);
    console.log(`\n"${name}" is ${isKnown ? '' : 'NOT '}a known ${market} entity\n`);

  } else if (command === 'generic') {
    const name = args[1];
    if (!market) {
      console.error('Error: --market required for generic check');
      process.exit(1);
    }
    const result = detector.detectGenericEntityPattern(name, market);
    console.log(`\n"${name}" is ${result.isGeneric ? '' : 'NOT '}a generic ${market} pattern`);
    if (result.matchedPattern) {
      console.log(`Matched pattern: "${result.matchedPattern}"`);
    }
    console.log('');

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
