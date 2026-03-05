#!/usr/bin/env node

/**
 * Runbook Differ
 *
 * Platform-agnostic section-aware diffing for runbooks.
 * Compares runbook versions intelligently by understanding markdown structure.
 *
 * Features:
 * - Section-aware comparison (understands H1, H2, H3 structure)
 * - Change categorization (added, deleted, modified)
 * - Metric extraction and comparison
 * - Summary statistics
 * - Human-readable diff output
 *
 * @module runbook-framework/core/differ
 */

const fs = require('fs');
const path = require('path');

/**
 * Runbook Differ - compares runbook versions
 */
class RunbookDiffer {
  /**
   * Create a new differ instance
   * @param {Object} adapter - Platform adapter instance
   */
  constructor(adapter) {
    this.adapter = adapter;
  }

  /**
   * Extract sections from runbook content
   * @param {string} content - Runbook markdown content
   * @returns {Object} Map of section name -> content
   */
  extractSections(content) {
    const sections = {};
    const lines = content.split('\n');

    let currentSection = '__header__';
    let currentContent = [];

    lines.forEach(line => {
      // Match H1, H2, H3 headers
      const h1Match = line.match(/^# (.+)$/);
      const h2Match = line.match(/^## (.+)$/);
      const h3Match = line.match(/^### (.+)$/);

      if (h1Match || h2Match) {
        // Save previous section
        if (currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }

        // Start new section
        currentSection = (h1Match || h2Match)[1].trim();
        currentContent = [line];
      } else {
        currentContent.push(line);
      }
    });

    // Save last section
    if (currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  }

  /**
   * Extract metrics from runbook content
   * @param {string} content - Runbook content
   * @returns {Object} Extracted metrics
   */
  extractMetrics(content) {
    const metrics = {
      version: null,
      lastUpdated: null,
      observationCount: null,
      objectCount: 0,
      workflowCount: 0,
      exceptionCount: 0,
      recommendationCount: 0
    };

    // Extract version from header or content
    const versionMatch = content.match(/version[:\s]+v?(\d+\.\d+\.\d+)/i);
    if (versionMatch) {
      metrics.version = versionMatch[1];
    }

    // Extract last updated date
    const dateMatch = content.match(/last updated[:\s]+(\d{4}-\d{2}-\d{2})/i);
    if (dateMatch) {
      metrics.lastUpdated = dateMatch[1];
    }

    // Extract observation count
    const obsMatch = content.match(/observations[:\s]+(\d+)/i);
    if (obsMatch) {
      metrics.observationCount = parseInt(obsMatch[1], 10);
    }

    // Count sections
    metrics.objectCount = (content.match(/### .+ \(object\)/gi) || []).length ||
      (content.match(/^### [A-Z]\w+$/gm) || []).length;
    metrics.workflowCount = (content.match(/### .+ \(workflow\)/gi) || []).length;
    metrics.exceptionCount = (content.match(/### .+ \(exception\)/gi) || []).length;
    metrics.recommendationCount = (content.match(/^- .+$/gm) || []).length;

    return metrics;
  }

  /**
   * Compare two sets of sections
   * @param {Object} oldSections - Previous sections
   * @param {Object} newSections - Current sections
   * @returns {Object} Section-level changes
   */
  compareSections(oldSections, newSections) {
    const changes = {
      added: [],
      deleted: [],
      modified: [],
      unchanged: []
    };

    const oldKeys = new Set(Object.keys(oldSections));
    const newKeys = new Set(Object.keys(newSections));

    // Find added sections
    for (const key of newKeys) {
      if (!oldKeys.has(key)) {
        changes.added.push({
          section: key,
          content: newSections[key]
        });
      }
    }

    // Find deleted sections
    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        changes.deleted.push({
          section: key,
          content: oldSections[key]
        });
      }
    }

    // Find modified sections
    for (const key of oldKeys) {
      if (newKeys.has(key)) {
        if (oldSections[key] !== newSections[key]) {
          changes.modified.push({
            section: key,
            oldContent: oldSections[key],
            newContent: newSections[key],
            lineDiff: this.computeLineDiff(oldSections[key], newSections[key])
          });
        } else {
          changes.unchanged.push(key);
        }
      }
    }

    return changes;
  }

  /**
   * Compute line-level diff between two text blocks
   * @param {string} oldText - Previous text
   * @param {string} newText - Current text
   * @returns {Object} Line diff result
   */
  computeLineDiff(oldText, newText) {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    const added = [];
    const removed = [];

    // Simple line-by-line diff (not optimal but sufficient)
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    newLines.forEach((line, idx) => {
      if (!oldSet.has(line) && line.trim()) {
        added.push({ line: idx + 1, content: line });
      }
    });

    oldLines.forEach((line, idx) => {
      if (!newSet.has(line) && line.trim()) {
        removed.push({ line: idx + 1, content: line });
      }
    });

    return {
      linesAdded: added.length,
      linesRemoved: removed.length,
      added,
      removed
    };
  }

  /**
   * Compare two runbook versions
   * @param {string} [fromVersion] - Starting version (default: previous)
   * @param {string} [toVersion] - Ending version (default: current)
   * @returns {Object} Comprehensive diff result
   */
  compare(fromVersion, toVersion) {
    // Get versioner to access version content
    const RunbookVersioner = require('./versioner');
    const versioner = new RunbookVersioner(this.adapter);

    // Determine versions
    const currentVersion = versioner.getCurrentVersion();
    const previousVersion = versioner.getPreviousVersion();

    const from = fromVersion || previousVersion;
    const to = toVersion || currentVersion;

    if (!from || !to) {
      return {
        success: false,
        error: 'Insufficient version history for comparison',
        fromVersion: from,
        toVersion: to
      };
    }

    // Get content
    let fromContent, toContent;

    if (from === currentVersion || !from) {
      fromContent = fs.readFileSync(this.adapter.getRunbookPath(), 'utf-8');
    } else {
      fromContent = versioner.getVersionContent(from);
    }

    if (to === currentVersion || !to) {
      toContent = fs.readFileSync(this.adapter.getRunbookPath(), 'utf-8');
    } else {
      toContent = versioner.getVersionContent(to);
    }

    if (!fromContent || !toContent) {
      return {
        success: false,
        error: 'Could not load version content',
        fromVersion: from,
        toVersion: to
      };
    }

    // Extract sections and metrics
    const fromSections = this.extractSections(fromContent);
    const toSections = this.extractSections(toContent);

    const fromMetrics = this.extractMetrics(fromContent);
    const toMetrics = this.extractMetrics(toContent);

    // Compare sections
    const sectionChanges = this.compareSections(fromSections, toSections);

    // Calculate statistics
    const statistics = {
      sectionsAdded: sectionChanges.added.length,
      sectionsDeleted: sectionChanges.deleted.length,
      sectionsModified: sectionChanges.modified.length,
      sectionsUnchanged: sectionChanges.unchanged.length,
      totalLinesAdded: sectionChanges.modified.reduce((sum, m) => sum + m.lineDiff.linesAdded, 0),
      totalLinesRemoved: sectionChanges.modified.reduce((sum, m) => sum + m.lineDiff.linesRemoved, 0)
    };

    // Generate summary
    const summary = this.generateSummary(sectionChanges, fromMetrics, toMetrics);

    return {
      success: true,
      fromVersion: from,
      toVersion: to,
      platform: this.adapter.platform,
      identifier: this.adapter.getInstanceIdentifier(),
      timestamp: new Date().toISOString(),
      metrics: {
        from: fromMetrics,
        to: toMetrics
      },
      changes: sectionChanges,
      statistics,
      summary
    };
  }

  /**
   * Generate human-readable summary of changes
   * @param {Object} changes - Section changes
   * @param {Object} fromMetrics - Previous metrics
   * @param {Object} toMetrics - Current metrics
   * @returns {string[]} Summary lines
   */
  generateSummary(changes, fromMetrics, toMetrics) {
    const summary = [];

    // Overall change summary
    if (changes.added.length > 0) {
      summary.push(`Added ${changes.added.length} section(s): ${changes.added.map(a => a.section).join(', ')}`);
    }

    if (changes.deleted.length > 0) {
      summary.push(`Removed ${changes.deleted.length} section(s): ${changes.deleted.map(d => d.section).join(', ')}`);
    }

    if (changes.modified.length > 0) {
      summary.push(`Modified ${changes.modified.length} section(s): ${changes.modified.map(m => m.section).join(', ')}`);
    }

    // Metric changes
    if (fromMetrics.observationCount !== toMetrics.observationCount) {
      const diff = toMetrics.observationCount - fromMetrics.observationCount;
      summary.push(`Observations: ${fromMetrics.observationCount} → ${toMetrics.observationCount} (${diff >= 0 ? '+' : ''}${diff})`);
    }

    if (fromMetrics.objectCount !== toMetrics.objectCount) {
      const diff = toMetrics.objectCount - fromMetrics.objectCount;
      summary.push(`Objects: ${fromMetrics.objectCount} → ${toMetrics.objectCount} (${diff >= 0 ? '+' : ''}${diff})`);
    }

    if (fromMetrics.workflowCount !== toMetrics.workflowCount) {
      const diff = toMetrics.workflowCount - fromMetrics.workflowCount;
      summary.push(`Workflows: ${fromMetrics.workflowCount} → ${toMetrics.workflowCount} (${diff >= 0 ? '+' : ''}${diff})`);
    }

    if (summary.length === 0) {
      summary.push('No significant changes detected');
    }

    return summary;
  }

  /**
   * Format diff result for terminal output
   * @param {Object} diffResult - Diff result from compare()
   * @returns {string} Formatted output
   */
  formatForTerminal(diffResult) {
    if (!diffResult.success) {
      return `Error: ${diffResult.error}`;
    }

    const lines = [];

    lines.push('═'.repeat(80));
    lines.push(`RUNBOOK DIFF: ${diffResult.fromVersion} → ${diffResult.toVersion}`);
    lines.push(`Platform: ${diffResult.platform} | Instance: ${diffResult.identifier}`);
    lines.push('═'.repeat(80));
    lines.push('');

    // Summary
    lines.push('SUMMARY');
    lines.push('─'.repeat(40));
    diffResult.summary.forEach(s => lines.push(`  ${s}`));
    lines.push('');

    // Statistics
    lines.push('STATISTICS');
    lines.push('─'.repeat(40));
    lines.push(`  Sections Added:    ${diffResult.statistics.sectionsAdded}`);
    lines.push(`  Sections Deleted:  ${diffResult.statistics.sectionsDeleted}`);
    lines.push(`  Sections Modified: ${diffResult.statistics.sectionsModified}`);
    lines.push(`  Lines Added:       ${diffResult.statistics.totalLinesAdded}`);
    lines.push(`  Lines Removed:     ${diffResult.statistics.totalLinesRemoved}`);
    lines.push('');

    // Detailed changes
    if (diffResult.changes.added.length > 0) {
      lines.push('ADDED SECTIONS');
      lines.push('─'.repeat(40));
      diffResult.changes.added.forEach(a => {
        lines.push(`  + ${a.section}`);
      });
      lines.push('');
    }

    if (diffResult.changes.deleted.length > 0) {
      lines.push('DELETED SECTIONS');
      lines.push('─'.repeat(40));
      diffResult.changes.deleted.forEach(d => {
        lines.push(`  - ${d.section}`);
      });
      lines.push('');
    }

    if (diffResult.changes.modified.length > 0) {
      lines.push('MODIFIED SECTIONS');
      lines.push('─'.repeat(40));
      diffResult.changes.modified.forEach(m => {
        lines.push(`  ~ ${m.section} (+${m.lineDiff.linesAdded}/-${m.lineDiff.linesRemoved} lines)`);
      });
      lines.push('');
    }

    lines.push('═'.repeat(80));

    return lines.join('\n');
  }
}

// Export
module.exports = RunbookDiffer;
