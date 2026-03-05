/**
 * Semantic Disambiguator
 *
 * Disambiguates acronyms and abbreviations based on context signals.
 * Part of the RevOps Data Quality System.
 *
 * @module semantic-disambiguator
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Default semantic dictionary with common business/government acronyms
 */
const DEFAULT_DICTIONARY = {
  acronyms: {
    'OEM': [
      { meaning: 'Office of Emergency Management', context: ['government', 'public_sector', 'emergency'], weight: 0.9 },
      { meaning: 'Original Equipment Manufacturer', context: ['manufacturing', 'commercial', 'technology', 'automotive'], weight: 0.8 }
    ],
    'CIO': [
      { meaning: 'Chief Information Officer', context: ['*'], weight: 1.0 }
    ],
    'CFO': [
      { meaning: 'Chief Financial Officer', context: ['*'], weight: 1.0 }
    ],
    'CEO': [
      { meaning: 'Chief Executive Officer', context: ['*'], weight: 1.0 }
    ],
    'COO': [
      { meaning: 'Chief Operating Officer', context: ['*'], weight: 1.0 }
    ],
    'CTO': [
      { meaning: 'Chief Technology Officer', context: ['*'], weight: 1.0 }
    ],
    'CMO': [
      { meaning: 'Chief Marketing Officer', context: ['*'], weight: 1.0 }
    ],
    'CRO': [
      { meaning: 'Chief Revenue Officer', context: ['sales', 'commercial'], weight: 0.8 },
      { meaning: 'Chief Risk Officer', context: ['finance', 'banking', 'insurance'], weight: 0.7 }
    ],
    'CISO': [
      { meaning: 'Chief Information Security Officer', context: ['*'], weight: 1.0 }
    ],
    'DOT': [
      { meaning: 'Department of Transportation', context: ['government', 'transportation'], weight: 0.9 },
      { meaning: 'Department of Treasury', context: ['government', 'finance'], weight: 0.5 }
    ],
    'DMV': [
      { meaning: 'Department of Motor Vehicles', context: ['government'], weight: 1.0 }
    ],
    'HR': [
      { meaning: 'Human Resources', context: ['*'], weight: 1.0 }
    ],
    'IT': [
      { meaning: 'Information Technology', context: ['*'], weight: 1.0 }
    ],
    'PM': [
      { meaning: 'Project Manager', context: ['technology', 'engineering'], weight: 0.7 },
      { meaning: 'Product Manager', context: ['technology', 'product'], weight: 0.7 },
      { meaning: 'Prime Minister', context: ['government', 'international'], weight: 0.3 }
    ],
    'VP': [
      { meaning: 'Vice President', context: ['*'], weight: 1.0 }
    ],
    'SVP': [
      { meaning: 'Senior Vice President', context: ['*'], weight: 1.0 }
    ],
    'EVP': [
      { meaning: 'Executive Vice President', context: ['*'], weight: 1.0 }
    ],
    'AVP': [
      { meaning: 'Associate Vice President', context: ['*'], weight: 1.0 }
    ],
    'BD': [
      { meaning: 'Business Development', context: ['sales', 'commercial'], weight: 0.9 },
      { meaning: 'Board of Directors', context: ['corporate', 'governance'], weight: 0.4 }
    ],
    'BDR': [
      { meaning: 'Business Development Representative', context: ['sales', 'commercial'], weight: 1.0 }
    ],
    'SDR': [
      { meaning: 'Sales Development Representative', context: ['sales', 'commercial'], weight: 1.0 }
    ],
    'AE': [
      { meaning: 'Account Executive', context: ['sales', 'commercial'], weight: 1.0 }
    ],
    'CSM': [
      { meaning: 'Customer Success Manager', context: ['*'], weight: 1.0 }
    ],
    'EM': [
      { meaning: 'Engineering Manager', context: ['technology', 'engineering'], weight: 0.8 },
      { meaning: 'Emergency Management', context: ['government', 'emergency'], weight: 0.7 }
    ],
    'PD': [
      { meaning: 'Police Department', context: ['government', 'law_enforcement'], weight: 0.9 },
      { meaning: 'Product Development', context: ['technology', 'product'], weight: 0.4 }
    ],
    'FD': [
      { meaning: 'Fire Department', context: ['government', 'fire'], weight: 1.0 }
    ],
    'EMS': [
      { meaning: 'Emergency Medical Services', context: ['government', 'healthcare', 'emergency'], weight: 1.0 }
    ],
    'GC': [
      { meaning: 'General Counsel', context: ['legal', 'corporate'], weight: 0.9 },
      { meaning: 'General Contractor', context: ['construction'], weight: 0.6 }
    ],
    'MD': [
      { meaning: 'Managing Director', context: ['finance', 'banking', 'corporate'], weight: 0.8 },
      { meaning: 'Medical Doctor', context: ['healthcare', 'medical'], weight: 0.7 }
    ],
    'RN': [
      { meaning: 'Registered Nurse', context: ['healthcare', 'medical'], weight: 1.0 }
    ],
    'PA': [
      { meaning: 'Physician Assistant', context: ['healthcare', 'medical'], weight: 0.8 },
      { meaning: 'Personal Assistant', context: ['administrative'], weight: 0.5 }
    ]
  },
  title_normalizations: {
    'VP': 'Vice President',
    'SVP': 'Senior Vice President',
    'EVP': 'Executive Vice President',
    'AVP': 'Associate Vice President',
    'Sr.': 'Senior',
    'Sr': 'Senior',
    'Jr.': 'Junior',
    'Jr': 'Junior',
    'Mgr': 'Manager',
    'Mgr.': 'Manager',
    'Dir': 'Director',
    'Dir.': 'Director',
    'Coord': 'Coordinator',
    'Coord.': 'Coordinator',
    'Admin': 'Administrator',
    'Admin.': 'Administrator',
    'Exec': 'Executive',
    'Exec.': 'Executive',
    'Asst': 'Assistant',
    'Asst.': 'Assistant',
    'Assoc': 'Associate',
    'Assoc.': 'Associate',
    'Eng': 'Engineer',
    'Eng.': 'Engineer',
    'Dev': 'Developer',
    'Tech': 'Technical',
    'Tech.': 'Technical',
    'Ops': 'Operations',
    'Mktg': 'Marketing',
    'Acct': 'Accountant',
    'Dept': 'Department',
    'Dept.': 'Department'
  }
};

/**
 * Context signal definitions for disambiguation
 */
const CONTEXT_SIGNALS = {
  industry_keywords: {
    government: ['government', 'gov', 'city', 'county', 'state', 'federal', 'municipal', 'public', 'agency', 'department'],
    healthcare: ['hospital', 'medical', 'health', 'clinic', 'care', 'pharma', 'pharmaceutical', 'biotech'],
    technology: ['software', 'tech', 'digital', 'saas', 'cloud', 'data', 'ai', 'ml', 'cyber'],
    finance: ['bank', 'financial', 'investment', 'capital', 'fund', 'asset', 'wealth', 'insurance'],
    manufacturing: ['manufacturing', 'industrial', 'factory', 'production', 'assembly'],
    sales: ['sales', 'revenue', 'commercial', 'business development'],
    legal: ['law', 'legal', 'attorney', 'counsel', 'litigation'],
    education: ['university', 'college', 'school', 'education', 'academic']
  },
  domain_patterns: {
    government: [/\.gov$/, /\.mil$/, /\.edu$/, /city\./i, /county\./i, /state\./i],
    healthcare: [/hospital/i, /health/i, /medical/i, /clinic/i],
    technology: [/tech/i, /software/i, /digital/i, /\.io$/, /\.ai$/],
    finance: [/bank/i, /capital/i, /fund/i, /invest/i],
    education: [/\.edu$/, /university/i, /college/i, /school/i]
  }
};

class SemanticDisambiguator {
  /**
   * Create a new SemanticDisambiguator instance
   * @param {Object} options - Configuration options
   * @param {string} [options.dictionaryPath] - Path to custom dictionary JSON file
   * @param {Object} [options.dictionary] - Custom dictionary object
   */
  constructor(options = {}) {
    this.dictionary = this._loadDictionary(options);
    this.contextSignals = CONTEXT_SIGNALS;
    this.cache = new Map();
  }

  /**
   * Load dictionary from file or use provided/default
   * @private
   */
  _loadDictionary(options) {
    if (options.dictionary) {
      return this._mergeDictionaries(DEFAULT_DICTIONARY, options.dictionary);
    }

    if (options.dictionaryPath) {
      try {
        const customDict = JSON.parse(fs.readFileSync(options.dictionaryPath, 'utf-8'));
        return this._mergeDictionaries(DEFAULT_DICTIONARY, customDict);
      } catch (error) {
        console.warn(`Failed to load dictionary from ${options.dictionaryPath}, using default: ${error.message}`);
      }
    }

    return DEFAULT_DICTIONARY;
  }

  /**
   * Merge two dictionaries, with custom taking precedence
   * @private
   */
  _mergeDictionaries(base, custom) {
    return {
      acronyms: { ...base.acronyms, ...custom.acronyms },
      title_normalizations: { ...base.title_normalizations, ...custom.title_normalizations }
    };
  }

  /**
   * Disambiguate an acronym or term based on context
   * @param {string} term - The term to disambiguate
   * @param {Object} context - Context signals for disambiguation
   * @param {string} [context.industry] - Industry of the associated account
   * @param {string} [context.account_type] - Type of account (commercial, government)
   * @param {boolean} [context.is_government] - Whether the account is a government entity
   * @param {string} [context.department] - Department or function
   * @param {string} [context.domain] - Website domain
   * @param {string} [context.account_name] - Account/company name
   * @returns {Object} Disambiguation result
   */
  disambiguate(term, context = {}) {
    const normalizedTerm = term.toUpperCase().trim();
    const cacheKey = `${normalizedTerm}:${JSON.stringify(context)}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const meanings = this.dictionary.acronyms[normalizedTerm];
    if (!meanings || meanings.length === 0) {
      return {
        term: normalizedTerm,
        meaning: null,
        confidence: 0,
        alternatives: [],
        status: 'unknown'
      };
    }

    // If only one meaning, return it directly
    if (meanings.length === 1) {
      const result = {
        term: normalizedTerm,
        meaning: meanings[0].meaning,
        confidence: 100,
        alternatives: [],
        status: 'unambiguous'
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    // Detect context signals
    const detectedContext = this._detectContext(context);

    // Score each meaning based on context alignment
    const scoredMeanings = meanings.map(m => ({
      ...m,
      score: this._calculateMeaningScore(m, detectedContext)
    })).sort((a, b) => b.score - a.score);

    const topMeaning = scoredMeanings[0];
    const alternatives = scoredMeanings.slice(1).map(m => ({
      meaning: m.meaning,
      score: m.score,
      contexts: m.context
    }));

    // Calculate confidence based on score difference
    const confidence = this._calculateConfidence(scoredMeanings);

    const result = {
      term: normalizedTerm,
      meaning: topMeaning.meaning,
      confidence,
      alternatives,
      status: confidence >= 80 ? 'confident' : confidence >= 50 ? 'likely' : 'ambiguous',
      detectedContext
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Detect context signals from the provided context object
   * @private
   */
  _detectContext(context) {
    const detected = new Set();

    // Check explicit flags
    if (context.is_government) {
      detected.add('government');
    }

    // Check industry
    if (context.industry) {
      const industry = context.industry.toLowerCase();
      for (const [category, keywords] of Object.entries(this.contextSignals.industry_keywords)) {
        if (keywords.some(kw => industry.includes(kw))) {
          detected.add(category);
        }
      }
    }

    // Check account type
    if (context.account_type) {
      const type = context.account_type.toLowerCase();
      if (type.includes('government') || type.includes('public')) {
        detected.add('government');
      }
    }

    // Check domain patterns
    if (context.domain) {
      for (const [category, patterns] of Object.entries(this.contextSignals.domain_patterns)) {
        if (patterns.some(p => p.test(context.domain))) {
          detected.add(category);
        }
      }
    }

    // Check account name for keywords
    if (context.account_name) {
      const name = context.account_name.toLowerCase();
      for (const [category, keywords] of Object.entries(this.contextSignals.industry_keywords)) {
        if (keywords.some(kw => name.includes(kw))) {
          detected.add(category);
        }
      }
    }

    // Check department
    if (context.department) {
      const dept = context.department.toLowerCase();
      for (const [category, keywords] of Object.entries(this.contextSignals.industry_keywords)) {
        if (keywords.some(kw => dept.includes(kw))) {
          detected.add(category);
        }
      }
    }

    return Array.from(detected);
  }

  /**
   * Calculate score for a meaning based on context alignment
   * @private
   */
  _calculateMeaningScore(meaning, detectedContext) {
    let score = meaning.weight * 50; // Base score from weight (0-50)

    // Wildcard context matches everything
    if (meaning.context.includes('*')) {
      score += 30;
    } else {
      // Check context overlap
      const overlap = meaning.context.filter(c =>
        detectedContext.includes(c) ||
        detectedContext.some(dc => dc.includes(c) || c.includes(dc))
      );

      score += overlap.length * 20; // +20 for each matching context

      // Penalty if no context matches and we have detected context
      if (overlap.length === 0 && detectedContext.length > 0) {
        score -= 15;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate confidence based on score distribution
   * @private
   */
  _calculateConfidence(scoredMeanings) {
    if (scoredMeanings.length <= 1) return 100;

    const top = scoredMeanings[0].score;
    const second = scoredMeanings[1].score;

    // Confidence based on gap between top two scores
    const gap = top - second;

    if (gap >= 30) return 95;
    if (gap >= 20) return 85;
    if (gap >= 10) return 70;
    if (gap >= 5) return 55;
    return 40;
  }

  /**
   * Normalize a job title, expanding abbreviations
   * @param {string} title - The job title to normalize
   * @param {Object} [context] - Optional context for disambiguation
   * @returns {Object} Normalized title result
   */
  normalizeTitle(title, context = {}) {
    if (!title) {
      return { original: title, normalized: title, changes: [] };
    }

    let normalized = title;
    const changes = [];

    // Expand abbreviations
    for (const [abbrev, expansion] of Object.entries(this.dictionary.title_normalizations)) {
      // Match whole word boundaries
      const pattern = new RegExp(`\\b${this._escapeRegex(abbrev)}\\b`, 'gi');
      if (pattern.test(normalized)) {
        const before = normalized;
        normalized = normalized.replace(pattern, expansion);
        if (before !== normalized) {
          changes.push({ from: abbrev, to: expansion });
        }
      }
    }

    // Handle any remaining acronyms in the title
    const acronymPattern = /\b([A-Z]{2,5})\b/g;
    let match;
    while ((match = acronymPattern.exec(normalized)) !== null) {
      const acronym = match[1];
      if (this.dictionary.acronyms[acronym]) {
        const disambiguated = this.disambiguate(acronym, context);
        if (disambiguated.confidence >= 80) {
          // Only replace if we're confident
          const replacement = disambiguated.meaning;
          normalized = normalized.replace(new RegExp(`\\b${acronym}\\b`), replacement);
          changes.push({ from: acronym, to: replacement, confidence: disambiguated.confidence });
        }
      }
    }

    return {
      original: title,
      normalized: normalized.trim(),
      changes
    };
  }

  /**
   * Escape special regex characters
   * @private
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Add a new acronym/term to the dictionary
   * @param {string} term - The acronym to add
   * @param {Array<Object>} meanings - Array of meaning objects
   */
  addTerm(term, meanings) {
    const normalizedTerm = term.toUpperCase().trim();
    this.dictionary.acronyms[normalizedTerm] = meanings;
    this.cache.clear(); // Invalidate cache
  }

  /**
   * Add a title normalization rule
   * @param {string} abbreviation - The abbreviation
   * @param {string} expansion - The full form
   */
  addTitleNormalization(abbreviation, expansion) {
    this.dictionary.title_normalizations[abbreviation] = expansion;
  }

  /**
   * Check if a term is in the dictionary
   * @param {string} term - The term to check
   * @returns {boolean}
   */
  hasTerm(term) {
    return !!this.dictionary.acronyms[term.toUpperCase().trim()];
  }

  /**
   * Get all meanings for a term (without disambiguation)
   * @param {string} term - The term to look up
   * @returns {Array<Object>|null}
   */
  getMeanings(term) {
    return this.dictionary.acronyms[term.toUpperCase().trim()] || null;
  }

  /**
   * Clear the disambiguation cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Export the current dictionary
   * @returns {Object}
   */
  exportDictionary() {
    return JSON.parse(JSON.stringify(this.dictionary));
  }
}

module.exports = {
  SemanticDisambiguator,
  DEFAULT_DICTIONARY,
  CONTEXT_SIGNALS
};
