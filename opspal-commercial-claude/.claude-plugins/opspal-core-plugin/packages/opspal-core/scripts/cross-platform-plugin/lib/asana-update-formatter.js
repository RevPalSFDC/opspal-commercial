#!/usr/bin/env node

/**
 * Asana Update Formatter
 *
 * Formats Asana updates according to brevity standards and templates.
 * Validates word count, ensures required elements, and provides structured output.
 *
 * Part of the Asana Agent Integration Playbook.
 *
 * @see ../../docs/ASANA_AGENT_PLAYBOOK.md
 * @see ../../templates/asana-updates/*.md
 */

class AsanaUpdateFormatter {
  constructor() {
    this.templates = {
      progress: { maxWords: 100, targetMin: 50, targetMax: 75 },
      blocker: { maxWords: 80, targetMin: 40, targetMax: 60 },
      completion: { maxWords: 150, targetMin: 60, targetMax: 100 },
      milestone: { maxWords: 200, targetMin: 100, targetMax: 150 }
    };
  }

  /**
   * Format progress update
   *
   * @param {object} data - Update data
   * @param {string} data.taskName - Task name
   * @param {string} data.date - Date (optional, defaults to today)
   * @param {array} data.completed - List of completed items
   * @param {string} data.inProgress - Current work item
   * @param {array} data.nextSteps - Next steps
   * @param {string} data.status - On Track / At Risk / Blocked
   * @param {string} data.notes - Additional notes (optional)
   * @returns {object} - Formatted update with validation
   */
  formatProgress(data) {
    const date = data.date || new Date().toISOString().split('T')[0];
    const completed = Array.isArray(data.completed) ? data.completed : [data.completed];
    const nextSteps = Array.isArray(data.nextSteps) ? data.nextSteps : [data.nextSteps];

    let text = `**Progress Update** - ${data.taskName} - ${date}\n\n`;
    text += `**Completed:**\n`;
    for (const item of completed) {
      text += `- ${item.startsWith('✅') ? item : '✅ ' + item}\n`;
    }
    text += `\n**In Progress:**\n- ${data.inProgress}\n\n`;
    text += `**Next:**\n`;
    for (const step of nextSteps) {
      text += `- ${step}\n`;
    }
    text += `\n**Status:** ${data.status}`;

    if (data.notes) {
      text += `\n\n**Notes:** ${data.notes}`;
    }

    return this._validate(text, 'progress');
  }

  /**
   * Format blocker update
   *
   * @param {object} data - Blocker data
   * @param {string} data.taskName - Task name
   * @param {string} data.issue - One-sentence problem description
   * @param {string} data.impact - What's blocked and for how long
   * @param {object} data.needs - Who needs to do what
   * @param {string} data.needs.who - Person or team (with @ if mention)
   * @param {string} data.needs.action - Specific action required
   * @param {string} data.workaround - Alternative path or "None"
   * @param {string} data.timeline - When resolution is needed
   * @param {string} data.severity - STANDARD or CRITICAL (optional)
   * @returns {object} - Formatted update with validation
   */
  formatBlocker(data) {
    const emoji = data.severity === 'CRITICAL' ? '🔴 CRITICAL BLOCKER' : '🚨 BLOCKED';

    let text = `**${emoji}** - ${data.taskName}\n\n`;
    text += `**Issue:** ${data.issue}\n\n`;
    text += `**Impact:** ${data.impact}\n\n`;

    if (typeof data.needs === 'string') {
      text += `**Needs:** ${data.needs}\n\n`;
    } else {
      const who = data.needs.who.startsWith('@') ? data.needs.who : '@' + data.needs.who;
      text += `**Needs:** ${who} ${data.needs.action}\n\n`;
    }

    text += `**Workaround:** ${data.workaround}\n\n`;
    text += `**Timeline:** ${data.timeline}`;

    return this._validate(text, 'blocker', { severity: data.severity });
  }

  /**
   * Format completion update
   *
   * @param {object} data - Completion data
   * @param {string} data.taskName - Task name
   * @param {array} data.deliverables - List of deliverables with optional links
   * @param {array} data.results - Key results or metrics
   * @param {string} data.documentation - Link to docs (optional)
   * @param {object} data.handoff - Handoff information (optional)
   * @param {string} data.handoff.who - Person to handoff to
   * @param {string} data.handoff.action - What they should do
   * @param {string} data.notes - Additional notes (optional)
   * @returns {object} - Formatted update with validation
   */
  formatCompletion(data) {
    const deliverables = Array.isArray(data.deliverables) ? data.deliverables : [data.deliverables];
    const results = Array.isArray(data.results) ? data.results : [data.results];

    let text = `**✅ COMPLETED** - ${data.taskName}\n\n`;

    text += `**Deliverables:**\n`;
    for (const item of deliverables) {
      if (typeof item === 'string') {
        text += `- ${item}\n`;
      } else {
        text += `- ${item.item}${item.link ? ': ' + item.link : ''}\n`;
      }
    }

    text += `\n**Results:**\n`;
    for (const result of results) {
      text += `- ${result}\n`;
    }

    if (data.documentation) {
      text += `\n**Documentation:** ${data.documentation}`;
    }

    if (data.handoff) {
      const who = data.handoff.who.startsWith('@') ? data.handoff.who : '@' + data.handoff.who;
      text += `\n\n**Handoff:** ${who} for ${data.handoff.action}`;
    }

    if (data.notes) {
      text += `\n\n**Notes:** ${data.notes}`;
    }

    const summary = this._generateCompletionSummary(deliverables, results);

    return { ...this._validate(text, 'completion'), summary };
  }

  /**
   * Format milestone update
   *
   * @param {object} data - Milestone data
   * @param {string} data.phaseName - Phase/milestone name
   * @param {string} data.summary - 1-2 sentence overview
   * @param {array} data.achievements - Key achievements with metrics
   * @param {object} data.stats - Phase statistics
   * @param {object} data.stats.duration - { actual, estimated, unit }
   * @param {object} data.stats.effort - { actual, estimated, unit }
   * @param {object} data.stats.deliverables - { count, list }
   * @param {object} data.nextPhase - { name, startDate }
   * @param {array} data.risks - Identified risks or ["None identified"]
   * @returns {object} - Formatted update with validation
   */
  formatMilestone(data) {
    const achievements = Array.isArray(data.achievements) ? data.achievements : [data.achievements];
    const risks = Array.isArray(data.risks) ? data.risks : [data.risks];

    let text = `**🎯 MILESTONE COMPLETE** - ${data.phaseName}\n\n`;
    text += `**Phase Summary:**\n${data.summary}\n\n`;

    text += `**Key Achievements:**\n`;
    for (const achievement of achievements) {
      if (typeof achievement === 'string') {
        text += `- ${achievement}\n`;
      } else {
        text += `- ${achievement.text}`;
        if (achievement.metric) {
          text += ` (${achievement.metric})`;
        }
        text += `\n`;
      }
    }

    text += `\n**Phase Stats:**\n`;
    if (data.stats.duration) {
      const d = data.stats.duration;
      const variance = d.actual === d.estimated ? '✅' : d.actual < d.estimated ? '⚡' : '⚠️';
      text += `- Duration: ${d.actual} ${d.unit} (vs ${d.estimated} ${d.unit} estimated) ${variance}\n`;
    }
    if (data.stats.effort) {
      const e = data.stats.effort;
      text += `- Effort: ${e.actual} ${e.unit} (vs ${e.estimated} ${e.unit} estimated)\n`;
    }
    if (data.stats.deliverables) {
      const deliv = data.stats.deliverables;
      const delivList = Array.isArray(deliv.list) ? deliv.list.join(', ') : deliv.list;
      text += `- Deliverables: ${deliv.count} (${delivList})\n`;
    }

    if (data.nextPhase) {
      text += `\n**Next Phase:** ${data.nextPhase.name}`;
      if (data.nextPhase.startDate) {
        text += ` (starts ${data.nextPhase.startDate})`;
      }
    }

    text += `\n\n**Risks Identified:**\n`;
    for (const risk of risks) {
      text += `- ${risk}\n`;
    }

    const progressPercentage = this._calculateProgress(data);

    return { ...this._validate(text, 'milestone'), progressPercentage };
  }

  /**
   * Validate update against template standards
   */
  _validate(text, type, metadata = {}) {
    const template = this.templates[type];
    const wordCount = this._countWords(text);

    const validation = {
      text,
      wordCount,
      type,
      valid: wordCount <= template.maxWords,
      withinTarget: wordCount >= template.targetMin && wordCount <= template.targetMax,
      maxWords: template.maxWords,
      targetRange: `${template.targetMin}-${template.targetMax}`,
      metadata
    };

    // Check for required elements based on type
    validation.hasRequiredElements = this._checkRequiredElements(text, type);

    if (!validation.hasRequiredElements) {
      validation.valid = false;
      validation.missingElements = this._getMissingElements(text, type);
    }

    return validation;
  }

  /**
   * Count words in text (excluding markdown symbols)
   */
  _countWords(text) {
    // Remove markdown formatting
    const cleaned = text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Links
      .replace(/#+\s/g, '')
      .replace(/^[-*]\s/gm, '');

    return cleaned.split(/\s+/).filter(w => w.length > 0).length;
  }

  /**
   * Check for required elements based on update type
   */
  _checkRequiredElements(text, type) {
    const requirements = {
      progress: ['**Completed:**', '**In Progress:**', '**Next:**', '**Status:**'],
      blocker: ['**Issue:**', '**Impact:**', '**Needs:**', '**Timeline:**'],
      completion: ['**Deliverables:**', '**Results:**'],
      milestone: ['**Phase Summary:**', '**Key Achievements:**', '**Phase Stats:**']
    };

    const required = requirements[type] || [];
    return required.every(element => text.includes(element));
  }

  /**
   * Get missing required elements
   */
  _getMissingElements(text, type) {
    const requirements = {
      progress: ['**Completed:**', '**In Progress:**', '**Next:**', '**Status:**'],
      blocker: ['**Issue:**', '**Impact:**', '**Needs:**', '**Timeline:**'],
      completion: ['**Deliverables:**', '**Results:**'],
      milestone: ['**Phase Summary:**', '**Key Achievements:**', '**Phase Stats:**']
    };

    const required = requirements[type] || [];
    return required.filter(element => !text.includes(element));
  }

  /**
   * Generate completion summary (for time tracking)
   */
  _generateCompletionSummary(deliverables, results) {
    const delivCount = deliverables.length;
    const firstResult = results[0] || 'Completed successfully';

    return `${delivCount} deliverable${delivCount > 1 ? 's' : ''} - ${firstResult}`;
  }

  /**
   * Calculate progress percentage for milestone
   */
  _calculateProgress(milestoneData) {
    // This is a simple estimation - can be enhanced
    // Assumes equal weight for each phase
    const phaseEstimate = milestoneData.phaseNumber || 1;
    const totalPhases = milestoneData.totalPhases || 4;

    return Math.round((phaseEstimate / totalPhases) * 100);
  }

  /**
   * Trim update to fit word limit
   */
  trimToLimit(text, type) {
    const template = this.templates[type];
    const words = text.split(/\s+/);

    if (words.length <= template.maxWords) {
      return text;
    }

    // Trim to max words
    const trimmed = words.slice(0, template.maxWords).join(' ');
    return trimmed + '... (trimmed)';
  }

  /**
   * Validate multiple updates
   */
  validateBatch(updates) {
    const results = [];

    for (const update of updates) {
      const validation = this._validate(update.text, update.type);
      results.push({
        updateId: update.id || 'unknown',
        valid: validation.valid,
        wordCount: validation.wordCount,
        issues: validation.valid ? [] : this._getIssues(validation)
      });
    }

    return {
      totalUpdates: updates.length,
      validUpdates: results.filter(r => r.valid).length,
      invalidUpdates: results.filter(r => !r.valid).length,
      results
    };
  }

  /**
   * Get validation issues
   */
  _getIssues(validation) {
    const issues = [];

    if (validation.wordCount > validation.maxWords) {
      issues.push(`Exceeds max word count: ${validation.wordCount} > ${validation.maxWords}`);
    }

    if (validation.missingElements && validation.missingElements.length > 0) {
      issues.push(`Missing required elements: ${validation.missingElements.join(', ')}`);
    }

    return issues;
  }
}

// Export for use in other scripts
module.exports = { AsanaUpdateFormatter };

// CLI usage
if (require.main === module) {
  const formatter = new AsanaUpdateFormatter();

  // Example usage
  console.log('=== Asana Update Formatter ===\n');

  // Example 1: Progress update
  const progress = formatter.formatProgress({
    taskName: 'Data Migration',
    completed: ['Exported 10,200 contacts', 'Cleaned and validated fields'],
    inProgress: 'Importing batch 1 of 3',
    nextSteps: ['Complete batches 2-3', 'Run deduplication check'],
    status: 'On Track'
  });

  console.log('Progress Update:');
  console.log(progress.text);
  console.log(`\nWord count: ${progress.wordCount} (target: ${progress.targetRange})`);
  console.log(`Valid: ${progress.valid ? '✅' : '❌'}`);

  console.log('\n---\n');

  // Example 2: Blocker update
  const blocker = formatter.formatBlocker({
    taskName: 'Salesforce Deployment',
    issue: 'Cannot deploy custom objects - need elevated permissions',
    impact: 'Blocks 8 hours of deployment work',
    needs: {
      who: '@admin',
      action: 'grant "Modify All Data" permission'
    },
    workaround: 'Can proceed with read-only analysis (60% of work)',
    timeline: 'Need permission today to hit Monday go-live'
  });

  console.log('Blocker Update:');
  console.log(blocker.text);
  console.log(`\nWord count: ${blocker.wordCount} (target: ${blocker.targetRange})`);
  console.log(`Valid: ${blocker.valid ? '✅' : '❌'}`);

  console.log('\n---\n');

  // Example 3: Completion update
  const completion = formatter.formatCompletion({
    taskName: 'HubSpot Data Migration',
    deliverables: [
      { item: '10,200 contacts imported', link: null },
      { item: '850 companies created and linked', link: null },
      { item: 'Migration report', link: 'https://...' }
    ],
    results: [
      '99.8% success rate (20 records flagged)',
      'All required fields populated',
      'Duplicate check passed'
    ],
    documentation: 'https://confluence.../migration-guide',
    handoff: {
      who: '@marketing-ops',
      action: 'user acceptance testing'
    },
    notes: '20 flagged records need attention (see report tab 3)'
  });

  console.log('Completion Update:');
  console.log(completion.text);
  console.log(`\nWord count: ${completion.wordCount} (target: ${completion.targetRange})`);
  console.log(`Valid: ${completion.valid ? '✅' : '❌'}`);
  console.log(`Summary: ${completion.summary}`);

  console.log('\n---\n');

  // Example 4: Milestone update
  const milestone = formatter.formatMilestone({
    phaseName: 'Discovery Phase',
    summary: 'Completed comprehensive audit of Salesforce instance, identifying optimization opportunities and technical debt.',
    achievements: [
      { text: 'Analyzed 1,200+ custom fields across 15 objects', metric: 1200 },
      { text: 'Documented 45 automation workflows', metric: 45 },
      { text: 'Identified $127K in annual efficiency opportunities', metric: 127000 }
    ],
    stats: {
      duration: { actual: 3, estimated: 3, unit: 'weeks' },
      effort: { actual: 82, estimated: 80, unit: 'hours' },
      deliverables: { count: 17, list: ['4 reports', '12 recommendations', '1 roadmap'] }
    },
    nextPhase: {
      name: 'Implementation Planning',
      startDate: '2025-10-28'
    },
    risks: [
      'Integration dependencies may require vendor coordination',
      '2 recommendations need executive approval'
    ]
  });

  console.log('Milestone Update:');
  console.log(milestone.text);
  console.log(`\nWord count: ${milestone.wordCount} (target: ${milestone.targetRange})`);
  console.log(`Valid: ${milestone.valid ? '✅' : '❌'}`);
  console.log(`Progress: ${milestone.progressPercentage}%`);
}
