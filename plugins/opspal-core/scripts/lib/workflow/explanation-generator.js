/**
 * ExplanationGenerator - Generate human-readable explanations for match decisions
 *
 * Transforms technical match results into clear, actionable explanations:
 * - Natural language descriptions of signals
 * - Market-specific context
 * - Confidence interpretation
 * - Recommendation rationale
 *
 * @module workflow/explanation-generator
 */

'use strict';

/**
 * Signal type templates for explanation
 */
const SIGNAL_TEMPLATES = {
  // Positive signals
  'SHARED_DOMAIN': {
    positive: 'Both records share the website domain "{value}"',
    icon: '🌐'
  },
  'BASE_NAME_MATCH': {
    positive: 'Company names match after removing location suffixes',
    icon: '🏢'
  },
  'EXACT_NAME_MATCH': {
    positive: 'Company names are exactly the same',
    icon: '✓'
  },
  'STATE_MATCH': {
    positive: 'Both are located in {value}',
    icon: '📍'
  },
  'CITY_MATCH': {
    positive: 'Both are located in {value}',
    icon: '🏙️'
  },
  'PHONE_AREA_MATCH': {
    positive: 'Phone numbers share area code {value}',
    icon: '📞'
  },
  'NPI_MATCH': {
    positive: 'Healthcare NPI identifiers match ({value})',
    icon: '🏥'
  },
  'EIN_MATCH': {
    positive: 'Tax EIN identifiers match ({value})',
    icon: '📋'
  },
  'DUNS_MATCH': {
    positive: 'DUNS numbers match ({value})',
    icon: '🔢'
  },
  'KNOWN_FRANCHISE': {
    positive: 'Recognized as locations of franchise "{value}"',
    icon: '🏪'
  },
  'STORE_NUMBER_PATTERN': {
    positive: 'Store/location numbers follow franchise pattern',
    icon: '#️⃣'
  },
  'CORPORATE_HIERARCHY': {
    positive: 'Appears to be parent-subsidiary relationship',
    icon: '🏛️'
  },

  // Negative signals
  'STATE_MISMATCH': {
    negative: 'Located in different states ({valueA} vs {valueB})',
    icon: '⚠️'
  },
  'DIFFERENT_STATE': {
    negative: 'Located in different states ({valueA} vs {valueB})',
    icon: '⚠️'
  },
  'DIFFERENT_DOMAIN': {
    negative: 'Have different website domains ({valueA} vs {valueB})',
    icon: '🔗'
  },
  'DIFFERENT_PHONE': {
    negative: 'Phone area codes differ ({valueA} vs {valueB})',
    icon: '📵'
  },
  'DIFFERENT_INDUSTRY': {
    negative: 'Listed in different industries ({valueA} vs {valueB})',
    icon: '🏭'
  },
  'NAME_MISMATCH': {
    negative: 'Names differ significantly',
    icon: '❌'
  },
  'IDENTIFIER_MISMATCH': {
    negative: 'Official identifiers do not match',
    icon: '🚫'
  },

  // Neutral/Informational
  'PARTIAL_NAME_MATCH': {
    neutral: 'Names share some common words',
    icon: '〜'
  },
  'GENERIC_NAME': {
    neutral: 'Name is a common/generic business name',
    icon: 'ℹ️'
  },
  'LOCATION_SUFFIX': {
    neutral: 'Name contains location-based suffix',
    icon: '📌'
  }
};

/**
 * Market descriptions
 */
const MARKET_DESCRIPTIONS = {
  healthcare: {
    name: 'Healthcare',
    context: 'Healthcare entities (hospitals, clinics, practices) require high certainty before merging due to regulatory and billing implications. Similar names in different locations are usually distinct entities.',
    riskLevel: 'HIGH',
    typicalPattern: 'Location-based branching (e.g., "Memorial Hospital - Downtown")'
  },
  financial: {
    name: 'Financial Services',
    context: 'Financial institutions have strict compliance requirements. Branches of the same bank are typically managed as separate records for regulatory purposes.',
    riskLevel: 'HIGH',
    typicalPattern: 'Branch locations with unique identifiers'
  },
  government: {
    name: 'Government',
    context: 'Government agencies are typically unique entities. Similar names across jurisdictions (city, county, state) are almost always different organizations.',
    riskLevel: 'HIGH',
    typicalPattern: 'Jurisdiction-based naming (e.g., "City of Springfield")'
  },
  nonprofit: {
    name: 'Nonprofit',
    context: 'Nonprofits may have chapters or affiliates with similar names. EIN matching is the most reliable indicator of same entity.',
    riskLevel: 'MEDIUM',
    typicalPattern: 'Chapter/affiliate structure'
  },
  franchise: {
    name: 'Franchise',
    context: 'Franchise locations share brand names and often domains but are independently owned. Store numbers or addresses distinguish locations.',
    riskLevel: 'LOW',
    typicalPattern: 'Identical name with store number or location suffix'
  },
  retail: {
    name: 'Retail',
    context: 'Retail chains have multiple locations that may appear similar. Focus on location-specific identifiers.',
    riskLevel: 'LOW',
    typicalPattern: 'Chain name with location identifier'
  },
  'professional-services': {
    name: 'Professional Services',
    context: 'Professional service firms may have multiple offices. Name variations often indicate different practices.',
    riskLevel: 'MEDIUM',
    typicalPattern: 'Office locations or partner names'
  },
  technology: {
    name: 'Technology',
    context: 'Tech companies typically have strong online presence. Domain matching is highly reliable in this market.',
    riskLevel: 'LOW',
    typicalPattern: 'Domain-centric identification'
  }
};

/**
 * Confidence level interpretations
 */
const CONFIDENCE_LEVELS = {
  VERY_HIGH: { min: 90, label: 'Very High', description: 'Strong evidence these are the same entity' },
  HIGH: { min: 80, label: 'High', description: 'Good evidence these are the same entity' },
  MODERATE: { min: 65, label: 'Moderate', description: 'Some evidence of match, but verification recommended' },
  LOW: { min: 50, label: 'Low', description: 'Limited evidence, careful review required' },
  VERY_LOW: { min: 0, label: 'Very Low', description: 'Insufficient evidence to suggest match' }
};

/**
 * Decision type descriptions
 */
const DECISION_DESCRIPTIONS = {
  AUTO_MERGE: {
    label: 'Auto-Merge',
    icon: '✅',
    description: 'Confidence is high enough for automatic merging',
    action: 'These records will be automatically merged unless flagged.'
  },
  REVIEW: {
    label: 'Review Required',
    icon: '👁️',
    description: 'Human review is required before any action',
    action: 'Please examine the evidence and make a decision.'
  },
  TAG: {
    label: 'Tag as Potential',
    icon: '🏷️',
    description: 'Not enough evidence for merge, but worth noting',
    action: 'Records will be tagged for future reference but not merged.'
  },
  NO_MATCH: {
    label: 'No Match',
    icon: '❌',
    description: 'Evidence suggests these are different entities',
    action: 'No action will be taken.'
  }
};

class ExplanationGenerator {
  /**
   * Create an ExplanationGenerator
   *
   * @param {Object} options - Configuration options
   * @param {Object} options.customTemplates - Custom signal templates
   * @param {Object} options.customMarkets - Custom market descriptions
   * @param {string} options.outputFormat - Output format ('markdown' | 'html' | 'text')
   */
  constructor(options = {}) {
    this.signalTemplates = { ...SIGNAL_TEMPLATES, ...options.customTemplates };
    this.marketDescriptions = { ...MARKET_DESCRIPTIONS, ...options.customMarkets };
    this.outputFormat = options.outputFormat || 'markdown';
  }

  /**
   * Generate full explanation for a match result
   *
   * @param {Object} matchResult - Match result from scoring system
   * @param {Object} options - Generation options
   * @returns {string} Human-readable explanation
   */
  explain(matchResult, options = {}) {
    const {
      includeContext = true,
      includeRecommendation = true,
      verbose = false
    } = options;

    const sections = [];

    // Summary section
    sections.push(this._generateSummary(matchResult));

    // Evidence section
    sections.push(this._generateEvidenceSection(matchResult, verbose));

    // Market context
    if (includeContext && matchResult.market) {
      sections.push(this._generateMarketContext(matchResult.market));
    }

    // Recommendation
    if (includeRecommendation) {
      sections.push(this._generateRecommendation(matchResult));
    }

    return this._joinSections(sections);
  }

  /**
   * Generate brief explanation (one-liner)
   *
   * @param {Object} matchResult - Match result
   * @returns {string} Brief explanation
   */
  explainBrief(matchResult) {
    const { confidence, decision, signals } = matchResult;
    const confidenceLevel = this._getConfidenceLevel(confidence);

    const positiveCount = (signals || []).filter(s =>
      typeof s === 'object' ? s.weight > 0 : true
    ).length;

    const decisionInfo = DECISION_DESCRIPTIONS[decision] || DECISION_DESCRIPTIONS.REVIEW;

    return `${decisionInfo.icon} ${decisionInfo.label}: ${confidenceLevel.label} confidence (${confidence}%) based on ${positiveCount} supporting signal(s).`;
  }

  /**
   * Describe a single signal
   *
   * @param {Object|string} signal - Signal to describe
   * @returns {string} Human-readable signal description
   */
  describeSignal(signal) {
    if (typeof signal === 'string') {
      const template = this.signalTemplates[signal];
      if (template) {
        return `${template.icon || '•'} ${template.positive || template.negative || template.neutral || signal}`;
      }
      return `• ${this._formatSignalType(signal)}`;
    }

    const { type, weight, value, valueA, valueB } = signal;
    const template = this.signalTemplates[type];

    if (!template) {
      return `• ${this._formatSignalType(type)}${value ? `: ${value}` : ''}`;
    }

    let text;
    if (weight > 0 && template.positive) {
      text = template.positive;
    } else if (weight < 0 && template.negative) {
      text = template.negative;
    } else {
      text = template.neutral || template.positive || template.negative || type;
    }

    // Replace placeholders
    text = text
      .replace('{value}', value || '')
      .replace('{valueA}', valueA || '')
      .replace('{valueB}', valueB || '');

    return `${template.icon || '•'} ${text}`;
  }

  /**
   * Describe a market
   *
   * @param {string} market - Market identifier
   * @returns {string} Market description
   */
  describeMarket(market) {
    const info = this.marketDescriptions[market];
    if (!info) {
      return `Unknown market: ${market}`;
    }

    return `**${info.name}** (${info.riskLevel} risk): ${info.context}`;
  }

  /**
   * Generate comparison table for two records
   *
   * @param {Object} recordA - First record
   * @param {Object} recordB - Second record
   * @param {Array} fieldsToCompare - Fields to include
   * @returns {string} Formatted comparison
   */
  generateComparisonTable(recordA, recordB, fieldsToCompare = null) {
    const fields = fieldsToCompare || [
      'Name', 'name',
      'State', 'state',
      'City', 'city',
      'Domain', 'domain', 'Website',
      'Phone', 'phone',
      'Industry', 'industry'
    ];

    const rows = [];
    const seen = new Set();

    for (const field of fields) {
      const lowerField = field.toLowerCase();
      if (seen.has(lowerField)) continue;

      const valueA = recordA[field];
      const valueB = recordB[field];

      if (valueA || valueB) {
        seen.add(lowerField);
        const match = valueA && valueB && String(valueA).toLowerCase() === String(valueB).toLowerCase();
        const icon = match ? '✓' : (valueA && valueB ? '✗' : '—');

        rows.push({
          field: this._formatFieldName(field),
          valueA: valueA || '(empty)',
          valueB: valueB || '(empty)',
          match,
          icon
        });
      }
    }

    if (this.outputFormat === 'markdown') {
      let table = '| Field | Record A | Record B | Match |\n';
      table += '|-------|----------|----------|-------|\n';
      for (const row of rows) {
        table += `| ${row.field} | ${row.valueA} | ${row.valueB} | ${row.icon} |\n`;
      }
      return table;
    }

    // Text format
    let text = 'Field Comparison:\n';
    for (const row of rows) {
      text += `  ${row.field}: ${row.valueA} vs ${row.valueB} ${row.icon}\n`;
    }
    return text;
  }

  /**
   * Generate confidence interpretation
   *
   * @param {number} confidence - Confidence score
   * @returns {Object} Confidence interpretation
   */
  interpretConfidence(confidence) {
    const level = this._getConfidenceLevel(confidence);
    return {
      score: confidence,
      level: level.label,
      description: level.description,
      formatted: `${confidence}% (${level.label})`
    };
  }

  /**
   * Generate action recommendation
   *
   * @param {Object} matchResult - Match result
   * @returns {Object} Recommendation with rationale
   */
  generateRecommendation(matchResult) {
    const { confidence, decision, signals, market } = matchResult;

    const decisionInfo = DECISION_DESCRIPTIONS[decision] || DECISION_DESCRIPTIONS.REVIEW;
    const positives = (signals || []).filter(s => typeof s === 'object' ? s.weight > 0 : true);
    const negatives = (signals || []).filter(s => typeof s === 'object' && s.weight < 0);

    let rationale = '';

    if (decision === 'AUTO_MERGE') {
      rationale = `Multiple strong signals support this match with ${confidence}% confidence.`;
    } else if (decision === 'REVIEW') {
      if (negatives.length > 0) {
        rationale = `While there is supporting evidence, ${negatives.length} concerning signal(s) require human judgment.`;
      } else {
        rationale = `Confidence of ${confidence}% is above threshold but below auto-merge level.`;
      }
    } else if (decision === 'TAG') {
      rationale = `Some matching signals present but insufficient confidence (${confidence}%) for definitive action.`;
    } else {
      rationale = `Insufficient evidence or conflicting signals suggest these are different entities.`;
    }

    const marketInfo = this.marketDescriptions[market];
    if (marketInfo && marketInfo.riskLevel === 'HIGH') {
      rationale += ` Note: ${marketInfo.name} is a high-risk market requiring extra scrutiny.`;
    }

    return {
      action: decisionInfo.label,
      icon: decisionInfo.icon,
      description: decisionInfo.description,
      actionText: decisionInfo.action,
      rationale,
      confidence,
      positiveSignals: positives.length,
      negativeSignals: negatives.length
    };
  }

  // ========== Private Methods ==========

  _generateSummary(matchResult) {
    const { confidence, decision, recordA, recordB } = matchResult;
    const confidenceLevel = this._getConfidenceLevel(confidence);
    const decisionInfo = DECISION_DESCRIPTIONS[decision] || DECISION_DESCRIPTIONS.REVIEW;

    const nameA = this._getRecordName(recordA);
    const nameB = this._getRecordName(recordB);

    let summary = `## Match Analysis\n\n`;
    summary += `**Records:** "${nameA}" and "${nameB}"\n\n`;
    summary += `**Decision:** ${decisionInfo.icon} ${decisionInfo.label}\n`;
    summary += `**Confidence:** ${confidence}% (${confidenceLevel.label})\n\n`;
    summary += `> ${confidenceLevel.description}\n`;

    return summary;
  }

  _generateEvidenceSection(matchResult, verbose) {
    const { signals } = matchResult;
    if (!signals || signals.length === 0) {
      return '## Evidence\n\nNo specific signals available.';
    }

    const positives = signals.filter(s => typeof s === 'object' ? s.weight > 0 : true);
    const negatives = signals.filter(s => typeof s === 'object' && s.weight < 0);

    let section = '## Evidence\n\n';

    if (positives.length > 0) {
      section += '### Supporting Evidence\n\n';
      for (const signal of positives) {
        section += this.describeSignal(signal) + '\n';
      }
      section += '\n';
    }

    if (negatives.length > 0) {
      section += '### Concerns\n\n';
      for (const signal of negatives) {
        section += this.describeSignal(signal) + '\n';
      }
      section += '\n';
    }

    if (verbose && matchResult.recordA && matchResult.recordB) {
      section += '### Field Comparison\n\n';
      section += this.generateComparisonTable(matchResult.recordA, matchResult.recordB);
    }

    return section;
  }

  _generateMarketContext(market) {
    const info = this.marketDescriptions[market];
    if (!info) {
      return '';
    }

    let section = '## Market Context\n\n';
    section += `**Market:** ${info.name} (${info.riskLevel} risk)\n\n`;
    section += `${info.context}\n\n`;

    if (info.typicalPattern) {
      section += `**Typical Pattern:** ${info.typicalPattern}\n`;
    }

    return section;
  }

  _generateRecommendation(matchResult) {
    const rec = this.generateRecommendation(matchResult);

    let section = '## Recommendation\n\n';
    section += `${rec.icon} **${rec.action}**\n\n`;
    section += `${rec.rationale}\n\n`;
    section += `*${rec.actionText}*\n`;

    return section;
  }

  _getConfidenceLevel(confidence) {
    for (const [, level] of Object.entries(CONFIDENCE_LEVELS)) {
      if (confidence >= level.min) {
        return level;
      }
    }
    return CONFIDENCE_LEVELS.VERY_LOW;
  }

  _getRecordName(record) {
    if (!record) return 'Unknown';
    return record.Name || record.name || record.CompanyName || 'Unnamed Record';
  }

  _formatSignalType(type) {
    // Convert SNAKE_CASE to Title Case
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  _formatFieldName(field) {
    // Convert camelCase or PascalCase to Title Case
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  _joinSections(sections) {
    return sections.filter(s => s && s.trim()).join('\n---\n\n');
  }
}

module.exports = {
  ExplanationGenerator,
  SIGNAL_TEMPLATES,
  MARKET_DESCRIPTIONS,
  CONFIDENCE_LEVELS,
  DECISION_DESCRIPTIONS
};
