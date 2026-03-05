/**
 * BLUF+4 Executive Summary Validator
 *
 * Validates BLUF+4 content quality beyond schema validation.
 * Checks word counts, anti-patterns, and executive-readiness.
 *
 * @version 1.0.0
 * @date 2025-11-25
 */

const fs = require('fs');
const path = require('path');

// Word count limits per section
const WORD_LIMITS = {
  bottomLine: { target: 30, max: 40, section: 'Bottom Line' },
  situation: { target: 35, max: 50, section: 'Situation' },
  nextSteps: { target: 40, max: 55, section: 'Next Steps' },
  risks: { target: 30, max: 40, section: 'Risks & Blockers' },
  support: { target: 25, max: 35, section: 'Support Needed' },
  total: { target: 160, max: 220, section: 'Total' }
};

// Anti-patterns to detect (executive unfriendly content)
const ANTI_PATTERNS = [
  {
    pattern: /\b(some|several|various|many|few)\b/gi,
    severity: 'warning',
    message: 'Vague quantifier detected. Use specific numbers for executives.',
    suggestion: 'Replace "some" with exact counts like "3" or "45%"'
  },
  {
    pattern: /\b(I ran|we executed|the script|API call|query)\b/gi,
    severity: 'warning',
    message: 'Process detail detected. Executives care about outcomes, not process.',
    suggestion: 'Remove implementation details, focus on results'
  },
  {
    pattern: /\b(basically|actually|really|very|quite|just)\b/gi,
    severity: 'info',
    message: 'Filler word detected. Remove for brevity.',
    suggestion: 'Delete the filler word entirely'
  },
  {
    pattern: /\b(was done|were found|has been|have been)\b/gi,
    severity: 'info',
    message: 'Passive voice detected. Prefer active voice for clarity.',
    suggestion: 'Rewrite in active voice: "We found" instead of "was found"'
  },
  {
    pattern: /\b(SOQL|APEX|LWC|DML|governor limits|metadata API)\b/gi,
    severity: 'error',
    message: 'Technical jargon detected. Executives may not understand.',
    suggestion: 'Translate to business terms or remove'
  },
  {
    pattern: /\b(First|Then|Next|After that|Finally)\b/gi,
    severity: 'warning',
    message: 'Sequential language suggests process narrative.',
    suggestion: 'Restructure to present findings, not the investigation process'
  },
  {
    pattern: /\b(TBD|TODO|FIXME|WIP)\b/gi,
    severity: 'error',
    message: 'Incomplete content marker detected.',
    suggestion: 'Complete the content before generating summary'
  },
  {
    pattern: /\b(lorem ipsum|placeholder|example\.com)\b/gi,
    severity: 'error',
    message: 'Placeholder content detected.',
    suggestion: 'Replace with real content'
  }
];

// Required elements for executive readiness
const REQUIRED_ELEMENTS = [
  { key: 'headline', label: 'Bottom Line headline', required: true },
  { key: 'keyFindings', label: 'Key findings', required: true, minCount: 1 },
  { key: 'nextSteps', label: 'Next steps', required: true, minCount: 1 }
];

// Recommended elements for quality
const RECOMMENDED_ELEMENTS = [
  { key: 'healthScore', label: 'Health score' },
  { key: 'roi', label: 'ROI/Impact projection' },
  { key: 'severity', label: 'Severity indicator' },
  { key: 'recommendation', label: 'Primary recommendation' }
];

class BLUF4Validator {

  constructor(options = {}) {
    this.verbose = options.verbose || false;
  }

  /**
   * Validate BLUF+4 input data
   *
   * @param {Object} input - BLUF+4 input data
   * @returns {Object} Validation result
   */
  validate(input) {
    const errors = [];
    const warnings = [];
    const info = [];
    const suggestions = [];

    // 1. Required elements check
    this._validateRequired(input, errors);

    // 2. Recommended elements check
    this._validateRecommended(input, warnings);

    // 3. Word count validation (if rendered content available)
    // Note: Word counts are validated at generation time

    // 4. Anti-pattern detection
    this._detectAntiPatterns(input, errors, warnings, info, suggestions);

    // 5. Quality checks
    this._validateQuality(input, warnings, suggestions);

    // Calculate overall score
    const score = this._calculateScore(errors, warnings, info);

    return {
      valid: errors.length === 0,
      score,
      errors,
      warnings,
      info,
      suggestions,
      summary: this._generateSummary(errors, warnings, info)
    };
  }

  /**
   * Validate rendered BLUF+4 content
   *
   * @param {string} content - Rendered markdown content
   * @returns {Object} Validation result for rendered content
   */
  validateRendered(content) {
    const errors = [];
    const warnings = [];
    const info = [];

    // Extract sections from rendered markdown
    const sections = this._extractSections(content);

    // Validate word counts
    for (const [sectionKey, limit] of Object.entries(WORD_LIMITS)) {
      if (sectionKey === 'total') continue;

      const sectionContent = sections[sectionKey] || '';
      const wordCount = this._countWords(sectionContent);

      if (wordCount > limit.max) {
        errors.push(`${limit.section}: ${wordCount} words (max: ${limit.max})`);
      } else if (wordCount > limit.target) {
        warnings.push(`${limit.section}: ${wordCount} words (target: ${limit.target})`);
      }
    }

    // Total word count
    const totalWords = this._countWords(content);
    if (totalWords > WORD_LIMITS.total.max) {
      errors.push(`Total: ${totalWords} words (max: ${WORD_LIMITS.total.max})`);
    } else if (totalWords > WORD_LIMITS.total.target) {
      warnings.push(`Total: ${totalWords} words (target: ${WORD_LIMITS.total.target})`);
    } else {
      info.push(`Total: ${totalWords} words (within target)`);
    }

    // Check for required sections
    const requiredSections = ['Bottom Line', 'Situation', 'Next Steps'];
    for (const section of requiredSections) {
      if (!content.includes(`## ${section}`)) {
        errors.push(`Missing required section: ${section}`);
      }
    }

    return {
      valid: errors.length === 0,
      wordCount: totalWords,
      errors,
      warnings,
      info
    };
  }

  /**
   * Get word count status for each section
   *
   * @param {Object} wordCounts - Word counts by section
   * @returns {Object} Status by section
   */
  getWordCountStatus(wordCounts) {
    const status = {};

    for (const [section, limit] of Object.entries(WORD_LIMITS)) {
      const count = wordCounts[section] || 0;

      if (count > limit.max) {
        status[section] = {
          status: 'error',
          count,
          target: limit.target,
          max: limit.max,
          message: `Exceeds maximum (${count}/${limit.max})`
        };
      } else if (count > limit.target) {
        status[section] = {
          status: 'warning',
          count,
          target: limit.target,
          max: limit.max,
          message: `Above target (${count}/${limit.target})`
        };
      } else {
        status[section] = {
          status: 'pass',
          count,
          target: limit.target,
          max: limit.max,
          message: `Within target (${count}/${limit.target})`
        };
      }
    }

    return status;
  }

  // Private methods

  _validateRequired(input, errors) {
    for (const element of REQUIRED_ELEMENTS) {
      const value = input[element.key];

      if (!value) {
        errors.push(`Missing required element: ${element.label}`);
      } else if (element.minCount && Array.isArray(value) && value.length < element.minCount) {
        errors.push(`${element.label} requires at least ${element.minCount} item(s)`);
      }
    }
  }

  _validateRecommended(input, warnings) {
    for (const element of RECOMMENDED_ELEMENTS) {
      if (!input[element.key]) {
        warnings.push(`Recommended element missing: ${element.label}`);
      }
    }
  }

  _detectAntiPatterns(input, errors, warnings, info, suggestions) {
    // Convert input to searchable string
    const contentParts = [];

    if (input.headline) contentParts.push(input.headline);
    if (input.recommendation) contentParts.push(input.recommendation);
    if (input.roi) contentParts.push(input.roi);
    if (input.comparison) contentParts.push(input.comparison);

    if (input.keyFindings) {
      input.keyFindings.forEach(f => contentParts.push(f.text));
    }
    if (input.nextSteps) {
      input.nextSteps.forEach(s => contentParts.push(s.action));
    }
    if (input.risks) {
      input.risks.forEach(r => {
        contentParts.push(r.description);
        if (r.mitigation) contentParts.push(r.mitigation);
      });
    }
    if (input.decisions) {
      input.decisions.forEach(d => contentParts.push(d.decision));
    }

    const content = contentParts.join(' ');

    for (const antiPattern of ANTI_PATTERNS) {
      const matches = content.match(antiPattern.pattern);
      if (matches) {
        const uniqueMatches = [...new Set(matches)];
        const entry = `${antiPattern.message} Found: "${uniqueMatches.slice(0, 3).join('", "')}"${uniqueMatches.length > 3 ? '...' : ''}`;

        switch (antiPattern.severity) {
          case 'error':
            errors.push(entry);
            break;
          case 'warning':
            warnings.push(entry);
            break;
          case 'info':
          default:
            info.push(entry);
        }

        suggestions.push({
          pattern: uniqueMatches[0],
          message: antiPattern.message,
          suggestion: antiPattern.suggestion
        });
      }
    }
  }

  _validateQuality(input, warnings, suggestions) {
    // Check action items have owners
    if (input.nextSteps) {
      const missingOwners = input.nextSteps.filter(s => !s.owner);
      if (missingOwners.length > 0) {
        warnings.push(`${missingOwners.length} action(s) missing owners`);
        suggestions.push({
          message: 'Actions without owners may not get completed',
          suggestion: 'Assign an owner to each action item'
        });
      }

      const missingTimelines = input.nextSteps.filter(s => !s.timeline);
      if (missingTimelines.length > 0) {
        warnings.push(`${missingTimelines.length} action(s) missing timelines`);
      }
    }

    // Check risks have mitigations
    if (input.risks) {
      const criticalWithoutMitigation = input.risks.filter(
        r => (r.type === 'CRITICAL' || r.type === 'HIGH') && !r.mitigation
      );
      if (criticalWithoutMitigation.length > 0) {
        warnings.push(`${criticalWithoutMitigation.length} critical/high risk(s) without mitigation`);
        suggestions.push({
          message: 'Critical risks should have mitigation strategies',
          suggestion: 'Add mitigation plans for high-severity risks'
        });
      }
    }

    // Check decisions have deadlines
    if (input.decisions) {
      const missingDeadlines = input.decisions.filter(d => !d.deadline);
      if (missingDeadlines.length > 0) {
        warnings.push(`${missingDeadlines.length} decision(s) missing deadlines`);
      }
    }

    // Check headline isn't too short
    if (input.headline && input.headline.length < 20) {
      warnings.push('Headline may be too brief to convey the bottom line');
    }
  }

  _calculateScore(errors, warnings, info) {
    // Start at 100, deduct for issues
    let score = 100;

    score -= errors.length * 15;    // Major deduction for errors
    score -= warnings.length * 5;   // Moderate deduction for warnings
    score -= info.length * 1;       // Minor deduction for info

    return Math.max(0, Math.min(100, score));
  }

  _generateSummary(errors, warnings, info) {
    const total = errors.length + warnings.length + info.length;

    if (total === 0) {
      return 'Excellent! No issues detected.';
    }

    const parts = [];
    if (errors.length > 0) parts.push(`${errors.length} error(s)`);
    if (warnings.length > 0) parts.push(`${warnings.length} warning(s)`);
    if (info.length > 0) parts.push(`${info.length} suggestion(s)`);

    return `Found ${parts.join(', ')}.`;
  }

  _extractSections(content) {
    const sections = {};

    // Extract content between ## headers
    const sectionMatches = content.matchAll(/## ([\w\s&]+)\n([\s\S]*?)(?=## |---|\*Generated|$)/g);

    for (const match of sectionMatches) {
      const header = match[1].trim().toLowerCase();
      const sectionContent = match[2].trim();

      // Map headers to section keys
      if (header.includes('bottom line')) {
        sections.bottomLine = sectionContent;
      } else if (header.includes('situation')) {
        sections.situation = sectionContent;
      } else if (header.includes('next step')) {
        sections.nextSteps = sectionContent;
      } else if (header.includes('risk') || header.includes('blocker')) {
        sections.risks = sectionContent;
      } else if (header.includes('support')) {
        sections.support = sectionContent;
      }
    }

    return sections;
  }

  _countWords(text) {
    if (!text) return 0;
    // Remove markdown formatting for accurate count
    const cleaned = text
      .replace(/\*\*|__|~~|`/g, '')      // Remove bold, italic, strikethrough, code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Convert links to text
      .replace(/[#\-*>|]/g, ' ')          // Remove markdown symbols
      .replace(/\s+/g, ' ')               // Normalize whitespace
      .trim();

    return cleaned.split(/\s+/).filter(word => word.length > 0).length;
  }
}

// Static method for quick validation
BLUF4Validator.validate = function(input, options = {}) {
  const validator = new BLUF4Validator(options);
  return validator.validate(input);
};

// Export constants for external use
BLUF4Validator.WORD_LIMITS = WORD_LIMITS;
BLUF4Validator.ANTI_PATTERNS = ANTI_PATTERNS;
BLUF4Validator.REQUIRED_ELEMENTS = REQUIRED_ELEMENTS;
BLUF4Validator.RECOMMENDED_ELEMENTS = RECOMMENDED_ELEMENTS;

module.exports = BLUF4Validator;
