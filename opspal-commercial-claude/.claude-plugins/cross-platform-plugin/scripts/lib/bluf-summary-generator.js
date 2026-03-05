/**
 * BLUF+4 Executive Summary Generator
 *
 * Generates standardized executive summaries using the BLUF+4 format:
 * - Bottom Line Up Front (conclusion/recommendation)
 * - Status/Situation (current state)
 * - Next Steps (actions to take)
 * - Risks/Blockers (impediments)
 * - Support Needed (decisions, approvals, resources)
 *
 * Purpose:
 * - Ensure consistent executive communication across all auditor agents
 * - Enforce brevity (150-220 words max)
 * - Validate quality (anti-pattern detection)
 * - Support multiple output formats
 *
 * Usage:
 * const BLUFSummaryGenerator = require('./bluf-summary-generator');
 * const generator = new BLUFSummaryGenerator();
 *
 * const result = await generator.generate({
 *   headline: "CPQ pricing accuracy at 67% is impacting quote margins",
 *   severity: "ACTION REQUIRED",
 *   recommendation: "Prioritize pricing rule cleanup within 30 days",
 *   roi: "$127K annual savings",
 *   healthScore: 58,
 *   keyFindings: [
 *     { icon: "🔴", text: "45% of pricing rules contain errors", metric: "127 of 283" }
 *   ],
 *   nextSteps: [
 *     { action: "Archive redundant pricing rules", owner: "sales-ops", timeline: "Week 1-2" }
 *   ],
 *   risks: [
 *     { icon: "🔴", type: "CRITICAL", description: "Requires VP Sales sign-off" }
 *   ],
 *   decisions: [
 *     { decision: "Approve pricing rule archive strategy", owner: "vp-sales", deadline: "Dec 6" }
 *   ]
 * });
 *
 * @version 1.0.0
 * @date 2025-11-25
 */

const fs = require('fs');
const path = require('path');

// Word count limits per section
const WORD_LIMITS = {
  bottomLine: { target: 30, max: 40 },
  situation: { target: 35, max: 50 },
  nextSteps: { target: 40, max: 55 },
  risks: { target: 30, max: 40 },
  support: { target: 25, max: 35 },
  total: { target: 160, max: 220 }
};

// Valid severity levels
const SEVERITY_LEVELS = ['CRITICAL', 'ACTION REQUIRED', 'ATTENTION', 'OPPORTUNITY', 'ON TRACK'];

// Health score to icon mapping
const HEALTH_ICONS = {
  excellent: { min: 90, max: 100, icon: '🟢', label: 'Excellent' },
  good: { min: 70, max: 89, icon: '🟢', label: 'Good' },
  moderate: { min: 50, max: 69, icon: '🟡', label: 'Moderate' },
  atRisk: { min: 30, max: 49, icon: '🟡', label: 'At Risk' },
  critical: { min: 0, max: 29, icon: '🔴', label: 'Critical' }
};

// Anti-patterns to detect
const ANTI_PATTERNS = [
  { pattern: /\b(some|several|various|many|few)\b/gi, message: 'Avoid vague quantifiers. Use specific numbers.' },
  { pattern: /\b(I ran|we executed|the script|API call)\b/gi, message: 'Avoid process details. Focus on outcomes.' },
  { pattern: /\b(basically|actually|really|very|quite)\b/gi, message: 'Remove filler words for brevity.' },
  { pattern: /\b(was done|were found|has been)\b/gi, message: 'Prefer active voice for clarity.' },
  { pattern: /\b(SOQL|APEX|LWC|DML|governor limits)\b/gi, message: 'Translate technical terms for executives.' }
];

class BLUFSummaryGenerator {

  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.strictMode = options.strictMode || false; // Fail on any validation error
  }

  /**
   * Generate BLUF+4 summary from structured input
   *
   * @param {Object} input - Structured input data
   * @param {string} input.headline - Bottom line headline (required)
   * @param {string} input.severity - Severity level (optional)
   * @param {string} input.recommendation - Primary recommendation (optional)
   * @param {string} input.roi - Projected ROI/impact (optional)
   * @param {number} input.healthScore - Health score 0-100 (optional)
   * @param {Array} input.keyFindings - Array of findings (required)
   * @param {Array} input.nextSteps - Array of actions (required)
   * @param {Array} input.risks - Array of risks (optional)
   * @param {Array} input.decisions - Array of decisions needed (optional)
   * @param {Array} input.approvals - Array of approvals needed (optional)
   * @param {Array} input.resources - Array of resources needed (optional)
   * @param {Object} input.metadata - Report metadata (optional)
   * @param {Object} options - Generation options
   * @param {string} options.format - Output format: 'markdown', 'terminal', 'json' (default: 'markdown')
   * @returns {Object} Generated summary with content and validation results
   */
  async generate(input, options = {}) {
    const format = options.format || 'markdown';

    // Validate input
    const validationResult = this.validate(input);
    if (!validationResult.valid && this.strictMode) {
      throw new Error(`BLUF validation failed: ${validationResult.errors.join(', ')}`);
    }

    // Build sections
    const sections = {
      bottomLine: this._buildBottomLine(input),
      situation: this._buildSituation(input),
      nextSteps: this._buildNextSteps(input),
      risks: this._buildRisks(input),
      support: this._buildSupport(input)
    };

    // Calculate word counts
    const wordCounts = this._calculateWordCounts(sections);

    // Detect anti-patterns
    const antiPatterns = this._detectAntiPatterns(sections);

    // Format output
    let content;
    switch (format) {
      case 'terminal':
        content = this._formatTerminal(sections, input);
        break;
      case 'json':
        content = this._formatJSON(sections, input, wordCounts);
        break;
      case 'markdown':
      default:
        content = this._formatMarkdown(sections, input);
    }

    return {
      content,
      format,
      sections: {
        bottomLine: { content: sections.bottomLine, wordCount: wordCounts.bottomLine },
        situation: { content: sections.situation, wordCount: wordCounts.situation },
        nextSteps: { content: sections.nextSteps, wordCount: wordCounts.nextSteps },
        risks: { content: sections.risks, wordCount: wordCounts.risks },
        support: { content: sections.support, wordCount: wordCounts.support }
      },
      metadata: {
        totalWordCount: wordCounts.total,
        generatedAt: new Date().toISOString(),
        format,
        traceId: `bluf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      },
      validation: {
        valid: validationResult.valid,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        antiPatterns: antiPatterns,
        wordCountStatus: this._getWordCountStatus(wordCounts)
      }
    };
  }

  /**
   * Validate input against BLUF+4 schema
   *
   * @param {Object} input - Input to validate
   * @returns {Object} {valid: boolean, errors: Array, warnings: Array}
   */
  validate(input) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!input.headline || typeof input.headline !== 'string') {
      errors.push('headline is required and must be a string');
    } else if (input.headline.length > 150) {
      errors.push(`headline exceeds max length (${input.headline.length}/150 chars)`);
    }

    if (!input.keyFindings || !Array.isArray(input.keyFindings) || input.keyFindings.length === 0) {
      errors.push('keyFindings is required and must be a non-empty array');
    } else if (input.keyFindings.length > 5) {
      warnings.push(`keyFindings has ${input.keyFindings.length} items (max recommended: 5)`);
    }

    if (!input.nextSteps || !Array.isArray(input.nextSteps) || input.nextSteps.length === 0) {
      errors.push('nextSteps is required and must be a non-empty array');
    } else if (input.nextSteps.length > 5) {
      warnings.push(`nextSteps has ${input.nextSteps.length} items (max recommended: 5)`);
    }

    // Optional field validation
    if (input.severity && !SEVERITY_LEVELS.includes(input.severity)) {
      warnings.push(`severity "${input.severity}" is not a standard level. Valid: ${SEVERITY_LEVELS.join(', ')}`);
    }

    if (input.healthScore !== undefined) {
      if (typeof input.healthScore !== 'number' || input.healthScore < 0 || input.healthScore > 100) {
        errors.push('healthScore must be a number between 0 and 100');
      }
    }

    if (input.recommendation && input.recommendation.length > 200) {
      warnings.push(`recommendation is long (${input.recommendation.length}/200 chars)`);
    }

    if (input.roi && input.roi.length > 100) {
      warnings.push(`roi is long (${input.roi.length}/100 chars)`);
    }

    if (input.risks && input.risks.length > 4) {
      warnings.push(`risks has ${input.risks.length} items (max recommended: 4)`);
    }

    if (input.decisions && input.decisions.length > 3) {
      warnings.push(`decisions has ${input.decisions.length} items (max recommended: 3)`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get health icon for score
   *
   * @param {number} score - Health score 0-100
   * @returns {Object} {icon, label}
   */
  getHealthIcon(score) {
    for (const [key, config] of Object.entries(HEALTH_ICONS)) {
      if (score >= config.min && score <= config.max) {
        return { icon: config.icon, label: config.label };
      }
    }
    return { icon: '❓', label: 'Unknown' };
  }

  // Private methods

  _buildBottomLine(input) {
    let content = '';

    if (input.severity) {
      content += `**${input.severity}**: `;
    }
    content += input.headline;

    if (input.recommendation) {
      content += `\n\n**Recommendation**: ${input.recommendation}`;
    }

    if (input.roi) {
      content += `\n**Projected Impact**: ${input.roi}`;
    }

    return content;
  }

  _buildSituation(input) {
    let content = '';

    if (input.healthScore !== undefined) {
      const healthInfo = this.getHealthIcon(input.healthScore);
      content += `**Health Score**: ${input.healthScore}/100 ${healthInfo.icon} ${healthInfo.label}\n\n`;
    }

    if (input.keyFindings && input.keyFindings.length > 0) {
      for (const finding of input.keyFindings.slice(0, 5)) {
        const icon = finding.icon || '•';
        const metric = finding.metric ? ` (${finding.metric})` : '';
        content += `- ${icon} ${finding.text}${metric}\n`;
      }
    }

    if (input.comparison) {
      content += `\n**vs Benchmark**: ${input.comparison}`;
    }

    return content.trim();
  }

  _buildNextSteps(input) {
    if (!input.nextSteps || input.nextSteps.length === 0) {
      return 'No immediate actions defined.';
    }

    let content = '';
    input.nextSteps.slice(0, 5).forEach((step, index) => {
      const owner = step.owner ? ` (@${step.owner})` : '';
      const timeline = step.timeline ? ` - ${step.timeline}` : '';
      content += `${index + 1}. **${step.action}**${owner}${timeline}\n`;
    });

    return content.trim();
  }

  _buildRisks(input) {
    if (!input.risks || input.risks.length === 0) {
      return 'No critical risks identified.';
    }

    let content = '';
    for (const risk of input.risks.slice(0, 4)) {
      const icon = risk.icon || '⚠️';
      const type = risk.type ? `**${risk.type}**: ` : '';
      const mitigation = risk.mitigation ? ` | *Mitigation*: ${risk.mitigation}` : '';
      content += `- ${icon} ${type}${risk.description}${mitigation}\n`;
    }

    return content.trim();
  }

  _buildSupport(input) {
    const parts = [];

    if (input.decisions && input.decisions.length > 0) {
      parts.push('**Decisions Required**:');
      for (const item of input.decisions.slice(0, 3)) {
        const deadline = item.deadline ? `, ${item.deadline}` : '';
        const owner = item.owner ? ` (by @${item.owner}${deadline})` : '';
        parts.push(`- ${item.decision}${owner}`);
      }
    }

    if (input.approvals && input.approvals.length > 0) {
      parts.push('\n**Approvals Needed**:');
      for (const item of input.approvals.slice(0, 3)) {
        const approver = item.approver ? ` (${item.approver})` : '';
        parts.push(`- ${item.item}${approver}`);
      }
    }

    if (input.resources && input.resources.length > 0) {
      parts.push('\n**Resources**:');
      for (const item of input.resources.slice(0, 3)) {
        const justification = item.justification ? ` - ${item.justification}` : '';
        parts.push(`- ${item.resource}${justification}`);
      }
    }

    if (parts.length === 0) {
      return 'No immediate support required. Proceed with planned actions.';
    }

    return parts.join('\n');
  }

  _calculateWordCounts(sections) {
    const countWords = (text) => {
      if (!text) return 0;
      return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    };

    const counts = {
      bottomLine: countWords(sections.bottomLine),
      situation: countWords(sections.situation),
      nextSteps: countWords(sections.nextSteps),
      risks: countWords(sections.risks),
      support: countWords(sections.support)
    };

    counts.total = Object.values(counts).reduce((sum, count) => sum + count, 0);

    return counts;
  }

  _getWordCountStatus(wordCounts) {
    const status = {};

    for (const [section, limit] of Object.entries(WORD_LIMITS)) {
      const count = wordCounts[section] || 0;
      if (count > limit.max) {
        status[section] = 'error';
      } else if (count > limit.target) {
        status[section] = 'warning';
      } else {
        status[section] = 'pass';
      }
    }

    return status;
  }

  _detectAntiPatterns(sections) {
    const allContent = Object.values(sections).join(' ');
    const detected = [];

    for (const { pattern, message } of ANTI_PATTERNS) {
      const matches = allContent.match(pattern);
      if (matches) {
        detected.push({
          pattern: pattern.toString(),
          matches: [...new Set(matches)],
          message
        });
      }
    }

    return detected;
  }

  _formatMarkdown(sections, input) {
    const metadata = input.metadata || {};
    const reportType = metadata.reportType || 'Executive Summary';
    const org = metadata.org || metadata.orgAlias || 'Unknown';
    const date = metadata.date || new Date().toISOString().split('T')[0];

    return `# Executive Summary

**Report**: ${reportType} | **Org**: ${org} | **Date**: ${date}

---

## Bottom Line
${sections.bottomLine}

---

## Situation
${sections.situation}

---

## Next Steps
${sections.nextSteps}

---

## Risks & Blockers
${sections.risks}

---

## Support Needed
${sections.support}

---
*Generated by **OpsPal by RevPal** | ${date}*
`;
  }

  _formatTerminal(sections, input) {
    const metadata = input.metadata || {};
    const org = metadata.org || metadata.orgAlias || 'Unknown';
    const date = new Date().toISOString().split('T')[0];

    // Terminal-friendly formatting with colors (ANSI codes)
    const BOLD = '\x1b[1m';
    const RESET = '\x1b[0m';
    const CYAN = '\x1b[36m';
    const YELLOW = '\x1b[33m';
    const GREEN = '\x1b[32m';

    return `
${BOLD}${CYAN}════════════════════════════════════════════════════════════════${RESET}
${BOLD}                    EXECUTIVE SUMMARY (BLUF+4)${RESET}
${BOLD}${CYAN}════════════════════════════════════════════════════════════════${RESET}

${BOLD}${YELLOW}▸ BOTTOM LINE${RESET}
${sections.bottomLine.replace(/\*\*/g, '')}

${BOLD}${YELLOW}▸ SITUATION${RESET}
${sections.situation.replace(/\*\*/g, '')}

${BOLD}${YELLOW}▸ NEXT STEPS${RESET}
${sections.nextSteps.replace(/\*\*/g, '')}

${BOLD}${YELLOW}▸ RISKS & BLOCKERS${RESET}
${sections.risks.replace(/\*\*/g, '')}

${BOLD}${YELLOW}▸ SUPPORT NEEDED${RESET}
${sections.support.replace(/\*\*/g, '')}

${BOLD}${CYAN}════════════════════════════════════════════════════════════════${RESET}
${GREEN}Generated by OpsPal by RevPal | ${org} | ${date}${RESET}
`;
  }

  _formatJSON(sections, input, wordCounts) {
    return JSON.stringify({
      format: 'bluf4',
      version: '1.0.0',
      metadata: {
        ...input.metadata,
        generatedAt: new Date().toISOString()
      },
      sections: {
        bottomLine: {
          headline: input.headline,
          severity: input.severity,
          recommendation: input.recommendation,
          roi: input.roi
        },
        situation: {
          healthScore: input.healthScore,
          keyFindings: input.keyFindings,
          comparison: input.comparison
        },
        nextSteps: input.nextSteps,
        risks: input.risks,
        support: {
          decisions: input.decisions,
          approvals: input.approvals,
          resources: input.resources
        }
      },
      rendered: {
        bottomLine: sections.bottomLine,
        situation: sections.situation,
        nextSteps: sections.nextSteps,
        risks: sections.risks,
        support: sections.support
      },
      wordCounts
    }, null, 2);
  }
}

// Static convenience method for quick generation
BLUFSummaryGenerator.generate = async function(input, options = {}) {
  const generator = new BLUFSummaryGenerator(options);
  return generator.generate(input, options);
};

// Export word limits for external validation
BLUFSummaryGenerator.WORD_LIMITS = WORD_LIMITS;
BLUFSummaryGenerator.SEVERITY_LEVELS = SEVERITY_LEVELS;
BLUFSummaryGenerator.HEALTH_ICONS = HEALTH_ICONS;

module.exports = BLUFSummaryGenerator;
