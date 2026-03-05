#!/usr/bin/env node

/**
 * Requirement Extractor - Plan Mode Enhancement
 *
 * Parses user requests into structured requirements with scope boundaries.
 *
 * Key Features:
 * - Extract explicit requirements from natural language
 * - Detect implicit assumptions
 * - Flag unbounded scope
 * - Generate structured requirement documents
 *
 * Addresses: Cohort 5 (planning/scope) - 16 reflections, $24K ROI
 *
 * Prevention Target: Unclear requirements → scope creep → incomplete implementations
 *
 * Usage:
 *   const { RequirementExtractor } = require('./requirement-extractor');
 *   const extractor = new RequirementExtractor();
 *
 *   const analysis = await extractor.analyze(userRequest);
 *   // Returns:
 *   // {
 *   //   explicitRequirements: [...],
 *   //   implicitAssumptions: [...],
 *   //   scopeBoundaries: { bounded: true/false, risks: [...] },
 *   //   clarificationNeeded: [...]
 *   // }
 */

const fs = require('fs').promises;
const path = require('path');

class RequirementExtractor {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './.requirements';

    // Patterns that indicate unbounded scope
    this.unboundedPatterns = [
      /\ball\b.*\b(objects|fields|properties|workflows|records|accounts|contacts)/i,
      /\bevery\b.*\b(object|field|property|workflow|record)/i,
      /\bcomprehensive\b/i,
      /\bcomplete\b.*\b(audit|analysis|review|migration)/i,
      /\bfull\b.*\b(audit|analysis|review|migration)/i,
      /\bentire\b.*\b(org|portal|system|database)/i,
      /\bacross all\b/i,
      /\band (any|all) related\b/i
    ];

    // Patterns that indicate vague requirements
    this.vaguePatterns = [
      /\bimprove\b(?! (by|to|from))/i,
      /\boptimize\b(?! (by|to|for))/i,
      /\bfix\b(?! (the|this|that))/i,
      /\bupdate\b(?! (the|this|that))/i,
      /\bmake (it |them )?(better|faster|cleaner)/i,
      /\bas (needed|necessary|appropriate|required)\b/i,
      /\betc\.?$/i
    ];

    // Patterns that indicate missing constraints
    this.missingConstraintPatterns = [
      /\bmigrate\b(?!.*\b(from|to|by|before)\b)/i,
      /\bdelete\b(?!.*\b(where|if|when|matching)\b)/i,
      /\bcreate\b(?!.*\b(with|using|based on|for)\b)/i
    ];

    // Keywords indicating explicit requirements
    this.explicitKeywords = [
      'must', 'should', 'shall', 'will', 'required', 'need to',
      'ensure', 'verify', 'validate', 'check', 'confirm'
    ];

    // Common assumption indicators
    this.assumptionIndicators = [
      'assuming', 'suppose', 'probably', 'likely', 'typically',
      'usually', 'generally', 'by default', 'I think', 'seems like'
    ];
  }

  /**
   * Analyze user request and extract structured requirements
   *
   * @param {string} userRequest - The user's request text
   * @param {Object} options - Additional options
   * @returns {Object} - Structured requirement analysis
   */
  async analyze(userRequest, options = {}) {
    const analysis = {
      originalRequest: userRequest,
      timestamp: new Date().toISOString(),
      explicitRequirements: [],
      implicitAssumptions: [],
      scopeBoundaries: {
        bounded: true,
        risks: []
      },
      clarificationNeeded: [],
      entities: {
        objects: [],
        fields: [],
        workflows: [],
        users: [],
        records: []
      },
      constraints: {
        timeframe: null,
        scope: null,
        conditions: []
      },
      successCriteria: []
    };

    // Extract explicit requirements
    analysis.explicitRequirements = this._extractExplicitRequirements(userRequest);

    // Detect implicit assumptions
    analysis.implicitAssumptions = this._detectAssumptions(userRequest);

    // Check scope boundaries
    analysis.scopeBoundaries = this._checkScopeBoundaries(userRequest);

    // Extract entities
    analysis.entities = this._extractEntities(userRequest);

    // Extract constraints
    analysis.constraints = this._extractConstraints(userRequest);

    // Generate clarification questions
    analysis.clarificationNeeded = this._generateClarifications(analysis);

    // Extract success criteria
    analysis.successCriteria = this._extractSuccessCriteria(userRequest);

    return analysis;
  }

  /**
   * Extract explicit requirements from request
   */
  _extractExplicitRequirements(text) {
    const requirements = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());

    sentences.forEach((sentence, index) => {
      const normalized = sentence.toLowerCase();

      // Check if sentence contains explicit requirement keywords
      const hasExplicitKeyword = this.explicitKeywords.some(keyword =>
        normalized.includes(keyword)
      );

      if (hasExplicitKeyword) {
        requirements.push({
          id: `REQ-${index + 1}`,
          text: sentence.trim(),
          priority: this._determinePriority(sentence),
          type: this._determineRequirementType(sentence)
        });
      }
    });

    return requirements;
  }

  /**
   * Detect implicit assumptions in request
   */
  _detectAssumptions(text) {
    const assumptions = [];

    // Check for assumption indicators
    this.assumptionIndicators.forEach(indicator => {
      const pattern = new RegExp(`\\b${indicator}\\b[^.!?]*[.!?]`, 'gi');
      const matches = text.match(pattern);

      if (matches) {
        matches.forEach(match => {
          assumptions.push({
            text: match.trim(),
            indicator,
            needsConfirmation: true
          });
        });
      }
    });

    // Check for implicit scope assumptions
    if (text.match(/\b(all|every|entire)\b/i)) {
      assumptions.push({
        text: 'Request may assume access to all records/objects in the system',
        indicator: 'implicit scope',
        needsConfirmation: true
      });
    }

    return assumptions;
  }

  /**
   * Check if scope is bounded or unbounded
   */
  _checkScopeBoundaries(text) {
    const boundaries = {
      bounded: true,
      risks: []
    };

    // Check for unbounded patterns
    this.unboundedPatterns.forEach(pattern => {
      if (pattern.test(text)) {
        boundaries.bounded = false;
        boundaries.risks.push({
          type: 'unbounded_scope',
          pattern: pattern.source,
          severity: 'high',
          message: 'Request appears to have unbounded scope. Consider adding specific limits or filters.'
        });
      }
    });

    // Check for vague requirements
    this.vaguePatterns.forEach(pattern => {
      if (pattern.test(text)) {
        boundaries.risks.push({
          type: 'vague_requirement',
          pattern: pattern.source,
          severity: 'medium',
          message: 'Request contains vague language. Consider specifying concrete criteria.'
        });
      }
    });

    // Check for missing constraints
    this.missingConstraintPatterns.forEach(pattern => {
      if (pattern.test(text)) {
        boundaries.risks.push({
          type: 'missing_constraint',
          pattern: pattern.source,
          severity: 'high',
          message: 'Request is missing important constraints (filters, conditions, limits).'
        });
      }
    });

    return boundaries;
  }

  /**
   * Extract entities mentioned in request
   */
  _extractEntities(text) {
    const entities = {
      objects: [],
      fields: [],
      workflows: [],
      users: [],
      records: []
    };

    // Common Salesforce objects
    const objectPattern = /\b(Account|Contact|Lead|Opportunity|Case|Task|Event|Campaign|Quote|Product|Order|Contract|User|Profile|PermissionSet|Layout|RecordType)s?\b/gi;
    const objectMatches = text.match(objectPattern);
    if (objectMatches) {
      entities.objects = [...new Set(objectMatches.map(m => m.trim()))];
    }

    // Field references
    const fieldPattern = /\b([A-Z][a-zA-Z]+)__c\b/g;
    const fieldMatches = text.match(fieldPattern);
    if (fieldMatches) {
      entities.fields = [...new Set(fieldMatches)];
    }

    // Workflow/flow references
    const workflowPattern = /\b(workflow|flow|process builder|approval process|trigger)s?\b/gi;
    const workflowMatches = text.match(workflowPattern);
    if (workflowMatches) {
      entities.workflows = [...new Set(workflowMatches.map(m => m.toLowerCase()))];
    }

    return entities;
  }

  /**
   * Extract constraints from request
   */
  _extractConstraints(text) {
    const constraints = {
      timeframe: null,
      scope: null,
      conditions: []
    };

    // Extract timeframe
    const timePatterns = [
      /within (\d+) (days?|weeks?|months?)/i,
      /by (.+?) \d{4}/i,
      /before (.+?)[.!?,]/i,
      /after (.+?)[.!?,]/i
    ];

    timePatterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match && !constraints.timeframe) {
        constraints.timeframe = match[0];
      }
    });

    // Extract scope constraints
    const scopePatterns = [
      /only (for|in|on) (.+?)[.!?,]/i,
      /limited to (.+?)[.!?,]/i,
      /where (.+?)[.!?,]/i,
      /matching (.+?)[.!?,]/i
    ];

    scopePatterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match && !constraints.scope) {
        constraints.scope = match[0];
      }
    });

    // Extract conditions
    const conditionPattern = /\b(if|when|unless|where|only if)\b (.+?)[.!?,]/gi;
    const conditionMatches = text.match(conditionPattern);
    if (conditionMatches) {
      constraints.conditions = conditionMatches.map(c => c.trim());
    }

    return constraints;
  }

  /**
   * Generate clarification questions based on analysis
   */
  _generateClarifications(analysis) {
    const clarifications = [];

    // For unbounded scope
    if (!analysis.scopeBoundaries.bounded) {
      clarifications.push({
        priority: 'high',
        question: 'The request appears to have unbounded scope. Can you specify limits or filters?',
        context: 'Prevents processing all records/objects which may be time-consuming or risky'
      });
    }

    // For vague requirements
    const vagueRisks = analysis.scopeBoundaries.risks.filter(r => r.type === 'vague_requirement');
    if (vagueRisks.length > 0) {
      clarifications.push({
        priority: 'high',
        question: 'The request contains vague language. Can you specify concrete success criteria?',
        context: 'Helps ensure we deliver exactly what you need'
      });
    }

    // For missing constraints
    const missingConstraints = analysis.scopeBoundaries.risks.filter(r => r.type === 'missing_constraint');
    if (missingConstraints.length > 0) {
      clarifications.push({
        priority: 'high',
        question: 'The request is missing important constraints. Which records/objects should be affected?',
        context: 'Prevents unintended changes to records that should not be modified'
      });
    }

    // For implicit assumptions
    if (analysis.implicitAssumptions.length > 0) {
      analysis.implicitAssumptions.forEach(assumption => {
        clarifications.push({
          priority: 'medium',
          question: `Is this assumption correct: "${assumption.text}"?`,
          context: 'Confirming assumptions prevents misaligned implementations'
        });
      });
    }

    // For missing timeframe
    if (!analysis.constraints.timeframe) {
      clarifications.push({
        priority: 'low',
        question: 'What is the expected timeline for this work?',
        context: 'Helps prioritize and plan implementation'
      });
    }

    // For missing success criteria
    if (analysis.successCriteria.length === 0) {
      clarifications.push({
        priority: 'high',
        question: 'How will we know when this is complete? What are the success criteria?',
        context: 'Defines done state and prevents scope creep'
      });
    }

    return clarifications;
  }

  /**
   * Extract success criteria from request
   */
  _extractSuccessCriteria(text) {
    const criteria = [];

    // Look for explicit success criteria
    const criteriaPatterns = [
      /so that (.+?)[.!?,]/gi,
      /to ensure (.+?)[.!?,]/gi,
      /result in (.+?)[.!?,]/gi,
      /outcome (?:should be|is) (.+?)[.!?,]/gi,
      /success (?:means|is) (.+?)[.!?,]/gi
    ];

    criteriaPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          criteria.push({
            text: match.trim(),
            measurable: this._isMeasurable(match),
            source: 'explicit'
          });
        });
      }
    });

    return criteria;
  }

  /**
   * Determine priority of requirement
   */
  _determinePriority(text) {
    const normalized = text.toLowerCase();

    if (normalized.includes('must') || normalized.includes('required') || normalized.includes('critical')) {
      return 'high';
    }
    if (normalized.includes('should') || normalized.includes('important')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Determine type of requirement
   */
  _determineRequirementType(text) {
    const normalized = text.toLowerCase();

    if (normalized.includes('create') || normalized.includes('build') || normalized.includes('implement')) {
      return 'functional';
    }
    if (normalized.includes('ensure') || normalized.includes('verify') || normalized.includes('validate')) {
      return 'validation';
    }
    if (normalized.includes('delete') || normalized.includes('remove') || normalized.includes('clean')) {
      return 'cleanup';
    }
    if (normalized.includes('migrate') || normalized.includes('move') || normalized.includes('transfer')) {
      return 'migration';
    }
    return 'other';
  }

  /**
   * Check if criterion is measurable
   */
  _isMeasurable(text) {
    const measurablePatterns = [
      /\d+\s*(percent|%)/i,
      /\d+\s*(records?|fields?|objects?)/i,
      /within \d+/i,
      /less than/i,
      /greater than/i,
      /all.*successfully/i
    ];

    return measurablePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Save analysis to file
   */
  async saveAnalysis(analysis, filename = null) {
    await fs.mkdir(this.outputDir, { recursive: true });

    const fname = filename || `requirement-analysis-${Date.now()}.json`;
    const filePath = path.join(this.outputDir, fname);

    await fs.writeFile(filePath, JSON.stringify(analysis, null, 2));

    return filePath;
  }

  /**
   * Generate human-readable summary
   */
  generateSummary(analysis) {
    let summary = '# Requirement Analysis Summary\n\n';

    summary += `**Original Request**: ${analysis.originalRequest}\n\n`;

    // Scope assessment
    summary += '## Scope Assessment\n\n';
    if (analysis.scopeBoundaries.bounded) {
      summary += '✅ Scope appears bounded\n\n';
    } else {
      summary += '⚠️  **WARNING: Unbounded scope detected**\n\n';
      analysis.scopeBoundaries.risks.forEach(risk => {
        summary += `- **${risk.type}**: ${risk.message}\n`;
      });
      summary += '\n';
    }

    // Explicit requirements
    if (analysis.explicitRequirements.length > 0) {
      summary += '## Explicit Requirements\n\n';
      analysis.explicitRequirements.forEach(req => {
        summary += `- [${req.priority.toUpperCase()}] ${req.text}\n`;
      });
      summary += '\n';
    }

    // Clarifications needed
    if (analysis.clarificationNeeded.length > 0) {
      summary += '## Clarifications Needed\n\n';
      analysis.clarificationNeeded.forEach((clarification, i) => {
        summary += `${i + 1}. **[${clarification.priority.toUpperCase()}]** ${clarification.question}\n`;
        summary += `   *Why: ${clarification.context}*\n\n`;
      });
    }

    // Constraints
    summary += '## Constraints\n\n';
    if (analysis.constraints.timeframe) {
      summary += `- **Timeframe**: ${analysis.constraints.timeframe}\n`;
    }
    if (analysis.constraints.scope) {
      summary += `- **Scope**: ${analysis.constraints.scope}\n`;
    }
    if (analysis.constraints.conditions.length > 0) {
      summary += `- **Conditions**:\n`;
      analysis.constraints.conditions.forEach(condition => {
        summary += `  - ${condition}\n`;
      });
    }
    if (!analysis.constraints.timeframe && !analysis.constraints.scope && analysis.constraints.conditions.length === 0) {
      summary += '*No explicit constraints specified*\n';
    }
    summary += '\n';

    // Success criteria
    if (analysis.successCriteria.length > 0) {
      summary += '## Success Criteria\n\n';
      analysis.successCriteria.forEach(criterion => {
        const measurable = criterion.measurable ? '✅ Measurable' : '⚠️  Not measurable';
        summary += `- ${criterion.text} (${measurable})\n`;
      });
      summary += '\n';
    } else {
      summary += '## Success Criteria\n\n';
      summary += '⚠️  **No success criteria specified** - How will we know when this is complete?\n\n';
    }

    return summary;
  }
}

// CLI interface
if (require.main === module) {
  const [,, ...args] = process.argv;
  const userRequest = args.join(' ');

  if (!userRequest) {
    console.log(`
Requirement Extractor - Plan Mode Enhancement

Usage:
  node requirement-extractor.js "<user request>"

Example:
  node requirement-extractor.js "Update all Opportunity fields to match the new naming convention"
    `);
    process.exit(1);
  }

  const extractor = new RequirementExtractor();

  async function main() {
    console.log('Analyzing request...\n');

    const analysis = await extractor.analyze(userRequest);
    const summary = extractor.generateSummary(analysis);

    console.log(summary);

    // Save full analysis
    const savedPath = await extractor.saveAnalysis(analysis);
    console.log(`\nFull analysis saved to: ${savedPath}`);

    // Exit with non-zero if clarifications needed
    if (analysis.clarificationNeeded.length > 0) {
      console.log('\n⚠️  Clarifications needed before proceeding');
      process.exit(2);
    }
  }

  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = { RequirementExtractor };
