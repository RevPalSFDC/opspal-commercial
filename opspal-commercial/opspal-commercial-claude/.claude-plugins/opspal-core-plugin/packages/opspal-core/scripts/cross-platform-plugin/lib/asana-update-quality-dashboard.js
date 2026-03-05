#!/usr/bin/env node

/**
 * Asana Update Quality Dashboard
 *
 * Analyzes Asana update quality across all agents, tracking metrics like:
 * - Brevity compliance (word counts)
 * - Actionability (includes next steps)
 * - Data density (metrics per 100 words)
 * - Template compliance
 *
 * Part of the Asana Agent Integration Playbook (Future Enhancement)
 */

const https = require('https');
const { AsanaUpdateFormatter } = require('./asana-update-formatter');

class AsanaUpdateQualityDashboard {
  constructor(accessToken, options = {}) {
    this.accessToken = accessToken;
    this.formatter = new AsanaUpdateFormatter();
    this.options = {
      lookbackDays: options.lookbackDays || 30,
      minUpdates: options.minUpdates || 5,
      ...options
    };
  }

  /**
   * Generate quality dashboard for project
   */
  async generateDashboard(projectId) {
    console.log(`📊 Generating Update Quality Dashboard\n`);
    console.log(`Project: ${projectId}`);
    console.log(`Lookback: ${this.options.lookbackDays} days\n`);

    // Get all tasks in project
    const tasks = await this._getTasks(projectId);
    console.log(`Tasks analyzed: ${tasks.length}\n`);

    // Analyze comments on each task
    const updates = [];
    for (const task of tasks) {
      const taskUpdates = await this._analyzeTaskUpdates(task.gid, task.name);
      updates.push(...taskUpdates);
    }

    console.log(`Total updates analyzed: ${updates.length}\n`);

    // Generate metrics
    const metrics = this._calculateMetrics(updates);

    // Display dashboard
    this._displayDashboard(metrics);

    return {
      projectId,
      lookbackDays: this.options.lookbackDays,
      tasksAnalyzed: tasks.length,
      updatesAnalyzed: updates.length,
      metrics
    };
  }

  /**
   * Analyze updates for a single task
   */
  async _analyzeTaskUpdates(taskId, taskName) {
    const stories = await this._getComments(taskId);
    const updates = [];

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.options.lookbackDays);

    for (const story of stories) {
      if (new Date(story.created_at) < cutoffDate) continue;

      const analysis = this._analyzeUpdate(story.text, taskName);

      updates.push({
        taskId,
        taskName,
        updateId: story.gid,
        createdAt: story.created_at,
        createdBy: story.created_by ? story.created_by.name : 'Unknown',
        ...analysis
      });
    }

    return updates;
  }

  /**
   * Analyze a single update
   */
  _analyzeUpdate(text, taskName) {
    const wordCount = this._countWords(text);

    // Detect update type
    const type = this._detectUpdateType(text);

    // Check template compliance
    const templateCompliance = this._checkTemplateCompliance(text, type);

    // Check for actionable elements
    const hasNextSteps = text.includes('**Next:**') || text.includes('Next Steps');
    const hasBlockers = text.includes('BLOCKED') || text.includes('Blocker');
    const hasMetrics = this._detectMetrics(text);

    // Calculate data density (metrics per 100 words)
    const dataDensity = hasMetrics > 0 ? (hasMetrics / wordCount) * 100 : 0;

    return {
      text,
      wordCount,
      type,
      templateCompliance,
      hasNextSteps,
      hasBlockers,
      metricsCount: hasMetrics,
      dataDensity,
      qualityScore: this._calculateQualityScore({
        wordCount,
        type,
        templateCompliance,
        hasNextSteps,
        hasMetrics,
        dataDensity
      })
    };
  }

  /**
   * Detect update type from text
   */
  _detectUpdateType(text) {
    if (text.includes('MILESTONE COMPLETE') || text.includes('🎯')) return 'milestone';
    if (text.includes('COMPLETED') || text.includes('✅')) return 'completion';
    if (text.includes('BLOCKED') || text.includes('🚨')) return 'blocker';
    if (text.includes('Progress Update')) return 'progress';
    return 'unknown';
  }

  /**
   * Check template compliance
   */
  _checkTemplateCompliance(text, type) {
    const requirements = {
      progress: ['**Completed:**', '**In Progress:**', '**Next:**', '**Status:**'],
      blocker: ['**Issue:**', '**Impact:**', '**Needs:**', '**Timeline:**'],
      completion: ['**Deliverables:**', '**Results:**'],
      milestone: ['**Phase Summary:**', '**Key Achievements:**', '**Phase Stats:**']
    };

    const required = requirements[type] || [];
    const found = required.filter(element => text.includes(element));

    return {
      compliant: found.length === required.length,
      foundElements: found.length,
      requiredElements: required.length,
      missing: required.filter(element => !text.includes(element))
    };
  }

  /**
   * Detect metrics in text (numbers, percentages, counts)
   */
  _detectMetrics(text) {
    const patterns = [
      /\d+[\d,]*\s*(records?|tasks?|fields?|hours?|minutes?)/gi,
      /\d+\.?\d*%/g,
      /\$[\d,]+/g,
      /\d+ of \d+/g
    ];

    let count = 0;
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) count += matches.length;
    }

    return count;
  }

  /**
   * Calculate quality score (0-100)
   */
  _calculateQualityScore(analysis) {
    let score = 0;

    // Brevity score (40 points max)
    const limits = this.formatter.templates[analysis.type] || { maxWords: 100 };
    if (analysis.wordCount <= limits.maxWords) {
      score += 40;
    } else {
      const penalty = Math.min((analysis.wordCount - limits.maxWords) / limits.maxWords, 1);
      score += 40 * (1 - penalty);
    }

    // Template compliance (30 points max)
    if (analysis.templateCompliance.compliant) {
      score += 30;
    } else {
      score += 30 * (analysis.templateCompliance.foundElements / analysis.templateCompliance.requiredElements);
    }

    // Actionability (15 points max)
    if (analysis.hasNextSteps || analysis.hasBlockers) {
      score += 15;
    }

    // Data density (15 points max)
    if (analysis.dataDensity > 3) {
      score += 15;
    } else {
      score += 15 * (analysis.dataDensity / 3);
    }

    return Math.round(score);
  }

  /**
   * Calculate aggregate metrics
   */
  _calculateMetrics(updates) {
    if (updates.length === 0) {
      return {
        totalUpdates: 0,
        avgWordCount: 0,
        avgQualityScore: 0,
        brevityCompliance: 0,
        templateCompliance: 0,
        actionability: 0
      };
    }

    const byType = {};
    const byAgent = {};

    for (const update of updates) {
      // By type
      if (!byType[update.type]) {
        byType[update.type] = [];
      }
      byType[update.type].push(update);

      // By agent (from createdBy)
      if (!byAgent[update.createdBy]) {
        byAgent[update.createdBy] = [];
      }
      byAgent[update.createdBy].push(update);
    }

    const metrics = {
      totalUpdates: updates.length,
      avgWordCount: this._avg(updates.map(u => u.wordCount)),
      avgQualityScore: this._avg(updates.map(u => u.qualityScore)),
      brevityCompliance: this._percent(updates.filter(u => {
        const limits = this.formatter.templates[u.type] || { maxWords: 100 };
        return u.wordCount <= limits.maxWords;
      }).length, updates.length),
      templateCompliance: this._percent(updates.filter(u => u.templateCompliance.compliant).length, updates.length),
      actionability: this._percent(updates.filter(u => u.hasNextSteps || u.hasBlockers).length, updates.length),
      avgDataDensity: this._avg(updates.map(u => u.dataDensity)),
      byType,
      byAgent,
      topIssues: this._identifyIssues(updates)
    };

    return metrics;
  }

  /**
   * Display dashboard
   */
  _displayDashboard(metrics) {
    console.log('═'.repeat(70));
    console.log('📊 ASANA UPDATE QUALITY DASHBOARD');
    console.log('═'.repeat(70));
    console.log();

    // Overall metrics
    console.log('Overall Metrics:');
    console.log(`  Total Updates: ${metrics.totalUpdates}`);
    console.log(`  Avg Quality Score: ${metrics.avgQualityScore}/100 ${this._scoreEmoji(metrics.avgQualityScore)}`);
    console.log(`  Avg Word Count: ${metrics.avgWordCount} words`);
    console.log(`  Brevity Compliance: ${metrics.brevityCompliance}% ${metrics.brevityCompliance >= 80 ? '✅' : '⚠️'}`);
    console.log(`  Template Compliance: ${metrics.templateCompliance}% ${metrics.templateCompliance >= 80 ? '✅' : '⚠️'}`);
    console.log(`  Actionability: ${metrics.actionability}% ${metrics.actionability >= 90 ? '✅' : '⚠️'}`);
    console.log(`  Avg Data Density: ${metrics.avgDataDensity.toFixed(2)} metrics/100 words`);
    console.log();

    // By update type
    console.log('By Update Type:');
    Object.entries(metrics.byType).forEach(([type, updates]) => {
      const avgScore = this._avg(updates.map(u => u.qualityScore));
      const avgWords = this._avg(updates.map(u => u.wordCount));
      console.log(`  ${type}: ${updates.length} updates, avg ${avgWords} words, score ${avgScore}/100`);
    });
    console.log();

    // By agent
    console.log('By Agent/User:');
    Object.entries(metrics.byAgent)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10)
      .forEach(([agent, updates]) => {
        const avgScore = this._avg(updates.map(u => u.qualityScore));
        console.log(`  ${agent}: ${updates.length} updates, avg score ${avgScore}/100`);
      });
    console.log();

    // Top issues
    if (metrics.topIssues.length > 0) {
      console.log('🔴 Top Quality Issues:');
      metrics.topIssues.forEach((issue, i) => {
        console.log(`  ${i+1}. ${issue.issue} (${issue.count} occurrences)`);
      });
      console.log();
    }

    console.log('═'.repeat(70));
  }

  /**
   * Identify top quality issues
   */
  _identifyIssues(updates) {
    const issues = [];

    // Too verbose
    const verbose = updates.filter(u => {
      const limits = this.formatter.templates[u.type] || { maxWords: 100 };
      return u.wordCount > limits.maxWords * 1.5;
    });
    if (verbose.length > 0) {
      issues.push({ issue: 'Updates too verbose (>150% of limit)', count: verbose.length });
    }

    // Missing template elements
    const nonCompliant = updates.filter(u => !u.templateCompliance.compliant);
    if (nonCompliant.length > 0) {
      issues.push({ issue: 'Missing required template elements', count: nonCompliant.length });
    }

    // No next steps
    const noAction = updates.filter(u => !u.hasNextSteps && u.type !== 'completion');
    if (noAction.length > 0) {
      issues.push({ issue: 'Missing next steps (not actionable)', count: noAction.length });
    }

    // Low data density
    const lowData = updates.filter(u => u.dataDensity < 1);
    if (lowData.length > 0) {
      issues.push({ issue: 'Low data density (no metrics)', count: lowData.length });
    }

    return issues.sort((a, b) => b.count - a.count);
  }

  /**
   * Get tasks from project
   */
  async _getTasks(projectId) {
    return this._asanaRequest('GET', `/projects/${projectId}/tasks?opt_fields=gid,name`);
  }

  /**
   * Get comments for task
   */
  async _getComments(taskId) {
    const stories = await this._asanaRequest('GET', `/tasks/${taskId}/stories`);
    return stories.filter(s => s.type === 'comment' && s.text);
  }

  /**
   * Count words
   */
  _countWords(text) {
    const cleaned = text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/#+\s/g, '')
      .replace(/^[-*]\s/gm, '');

    return cleaned.split(/\s+/).filter(w => w.length > 0).length;
  }

  /**
   * Calculate average
   */
  _avg(numbers) {
    if (numbers.length === 0) return 0;
    return Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length);
  }

  /**
   * Calculate percentage
   */
  _percent(numerator, denominator) {
    if (denominator === 0) return 0;
    return Math.round((numerator / denominator) * 100);
  }

  /**
   * Get emoji for score
   */
  _scoreEmoji(score) {
    if (score >= 90) return '🟢';
    if (score >= 70) return '🟡';
    return '🔴';
  }

  /**
   * Make Asana API request
   */
  async _asanaRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'app.asana.com',
        port: 443,
        path: `/api/1.0${path}`,
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed.data);
            } else {
              reject(new Error(`Asana API error (${res.statusCode}): ${JSON.stringify(parsed)}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${responseData}`));
          }
        });
      });

      req.on('error', reject);

      if (data) {
        req.write(JSON.stringify({ data }));
      }

      req.end();
    });
  }
}

// Export
module.exports = { AsanaUpdateQualityDashboard };

// CLI usage
if (require.main === module) {
  const projectId = process.argv[2] || process.env.ASANA_PROJECT_GID;
  const accessToken = process.env.ASANA_ACCESS_TOKEN;

  if (!accessToken) {
    console.error('❌ ASANA_ACCESS_TOKEN not set');
    console.error('   Run: set -a && source .env && set +a');
    process.exit(1);
  }

  if (!projectId) {
    console.error('Usage: node asana-update-quality-dashboard.js <project-id>');
    process.exit(1);
  }

  const dashboard = new AsanaUpdateQualityDashboard(accessToken, {
    lookbackDays: 30,
    minUpdates: 5
  });

  dashboard.generateDashboard(projectId)
    .then(results => {
      console.log('\n✅ Dashboard generated successfully');
      console.log(`\nSummary: ${results.updatesAnalyzed} updates analyzed across ${results.tasksAnalyzed} tasks`);
      console.log(`Quality Score: ${results.metrics.avgQualityScore}/100`);
    })
    .catch(error => {
      console.error('\n❌ Dashboard generation failed');
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}
