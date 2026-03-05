/**
 * Skill Usage Tracker
 *
 * Tracks skill invocations to enable usage-based prioritization.
 * Logs skill usage to JSON Lines format for analysis.
 *
 * Usage:
 *   const tracker = new SkillUsageTracker();
 *   tracker.logUsage('salesforce-plugin', 'cpq-assessment', { taskDescription: 'Run CPQ assessment' });
 *
 *   // Analyze usage
 *   const stats = tracker.getUsageStats();
 *   const topSkills = tracker.getTopNSkills(50);
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class SkillUsageTracker {
  constructor(logPath = null) {
    // Default to user home directory for persistent tracking
    this.logPath = logPath || path.join(os.homedir(), '.claude', 'skill-usage.jsonl');
    this.ensureLogDirectory();
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Log a skill usage event
   * @param {string} plugin - Plugin name
   * @param {string} skill - Skill name
   * @param {Object} metadata - Additional metadata (optional)
   */
  logUsage(plugin, skill, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      plugin,
      skill,
      metadata
    };

    // Append to log file (JSON Lines format)
    fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n');
  }

  /**
   * Read all usage logs
   * @returns {Array} Array of usage entries
   */
  readLogs() {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }

    const content = fs.readFileSync(this.logPath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.error(`Failed to parse log line: ${line}`);
        return null;
      }
    }).filter(entry => entry !== null);
  }

  /**
   * Get usage statistics
   * @param {number} daysBack - Number of days to analyze (default: 30)
   * @returns {Object} Usage statistics
   */
  getUsageStats(daysBack = 30) {
    const logs = this.readLogs();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Filter to recent logs
    const recentLogs = logs.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= cutoffDate;
    });

    // Count usage by skill
    const skillCounts = {};
    const pluginCounts = {};

    for (const entry of recentLogs) {
      const key = `${entry.plugin}:${entry.skill}`;
      skillCounts[key] = (skillCounts[key] || 0) + 1;
      pluginCounts[entry.plugin] = (pluginCounts[entry.plugin] || 0) + 1;
    }

    return {
      totalInvocations: recentLogs.length,
      uniqueSkills: Object.keys(skillCounts).length,
      uniquePlugins: Object.keys(pluginCounts).length,
      skillCounts,
      pluginCounts,
      dateRange: {
        start: cutoffDate.toISOString(),
        end: new Date().toISOString()
      }
    };
  }

  /**
   * Get top N most-used skills
   * @param {number} n - Number of top skills to return
   * @param {number} daysBack - Number of days to analyze
   * @returns {Array} Array of {plugin, skill, count} objects
   */
  getTopNSkills(n = 50, daysBack = 30) {
    const stats = this.getUsageStats(daysBack);

    // Convert to array and sort by count
    const skillArray = Object.entries(stats.skillCounts).map(([key, count]) => {
      const [plugin, skill] = key.split(':');
      return { plugin, skill, count };
    });

    skillArray.sort((a, b) => b.count - a.count);

    return skillArray.slice(0, n);
  }

  /**
   * Determine if a skill is in the "hot path" (frequently used)
   * @param {string} plugin - Plugin name
   * @param {string} skill - Skill name
   * @param {number} topN - Size of hot path (default: 50)
   * @returns {boolean} True if skill is in hot path
   */
  isHotPath(plugin, skill, topN = 50) {
    const topSkills = this.getTopNSkills(topN);
    return topSkills.some(s => s.plugin === plugin && s.skill === skill);
  }

  /**
   * Get hot path skills (frequently used)
   * @param {number} topN - Size of hot path
   * @returns {Object} Map of plugin → skill names in hot path
   */
  getHotPathSkills(topN = 50) {
    const topSkills = this.getTopNSkills(topN);
    const hotPath = {};

    for (const { plugin, skill } of topSkills) {
      if (!hotPath[plugin]) {
        hotPath[plugin] = [];
      }
      hotPath[plugin].push(skill);
    }

    return hotPath;
  }

  /**
   * Clear usage logs (for testing or reset)
   */
  clearLogs() {
    if (fs.existsSync(this.logPath)) {
      fs.unlinkSync(this.logPath);
    }
  }

  /**
   * Export usage stats to JSON file
   * @param {string} outputPath - Path to output file
   */
  exportStats(outputPath) {
    const stats = this.getUsageStats();
    const topSkills = this.getTopNSkills(100);

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalInvocations: stats.totalInvocations,
        uniqueSkills: stats.uniqueSkills,
        uniquePlugins: stats.uniquePlugins,
        dateRange: stats.dateRange
      },
      topSkills,
      byPlugin: {}
    };

    // Group top skills by plugin
    for (const { plugin, skill, count } of topSkills) {
      if (!report.byPlugin[plugin]) {
        report.byPlugin[plugin] = [];
      }
      report.byPlugin[plugin].push({ skill, count });
    }

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  }
}

// CLI usage
if (require.main === module) {
  const tracker = new SkillUsageTracker();
  const command = process.argv[2];

  if (command === 'log') {
    // Log a skill usage
    const plugin = process.argv[3];
    const skill = process.argv[4];
    const taskDesc = process.argv[5] || '';

    if (!plugin || !skill) {
      console.error('Usage: node skill-usage-tracker.js log <plugin> <skill> [taskDescription]');
      process.exit(1);
    }

    tracker.logUsage(plugin, skill, { taskDescription: taskDesc });
    console.log(`✅ Logged usage: ${plugin}:${skill}`);
  } else if (command === 'stats') {
    // Show usage statistics
    const daysBack = parseInt(process.argv[3]) || 30;
    const stats = tracker.getUsageStats(daysBack);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SKILL USAGE STATISTICS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\nDate Range: ${stats.dateRange.start} to ${stats.dateRange.end}`);
    console.log(`Total Invocations: ${stats.totalInvocations}`);
    console.log(`Unique Skills: ${stats.uniqueSkills}`);
    console.log(`Unique Plugins: ${stats.uniquePlugins}\n`);

    console.log('Top 20 Skills:');
    const topSkills = tracker.getTopNSkills(20, daysBack);
    topSkills.forEach((s, i) => {
      console.log(`  ${(i + 1).toString().padStart(2)}. ${s.plugin}:${s.skill.padEnd(30)} ${s.count} uses`);
    });

    console.log('\nBy Plugin:');
    const sortedPlugins = Object.entries(stats.pluginCounts)
      .sort((a, b) => b[1] - a[1]);
    sortedPlugins.forEach(([plugin, count]) => {
      console.log(`  ${plugin.padEnd(30)} ${count} uses`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } else if (command === 'top') {
    // Show top N skills
    const n = parseInt(process.argv[3]) || 50;
    const topSkills = tracker.getTopNSkills(n);

    console.log(`\nTop ${n} Most-Used Skills:\n`);
    topSkills.forEach((s, i) => {
      console.log(`${(i + 1).toString().padStart(3)}. ${s.plugin}:${s.skill.padEnd(35)} ${s.count} uses`);
    });
    console.log('');
  } else if (command === 'export') {
    // Export stats to file
    const outputPath = process.argv[3] || './skill-usage-report.json';
    tracker.exportStats(outputPath);
    console.log(`✅ Exported usage stats to: ${outputPath}`);
  } else if (command === 'clear') {
    // Clear logs
    tracker.clearLogs();
    console.log('✅ Cleared usage logs');
  } else {
    console.log('Usage:');
    console.log('  node skill-usage-tracker.js log <plugin> <skill> [taskDescription]');
    console.log('  node skill-usage-tracker.js stats [daysBack]');
    console.log('  node skill-usage-tracker.js top [n]');
    console.log('  node skill-usage-tracker.js export [outputPath]');
    console.log('  node skill-usage-tracker.js clear');
  }
}

module.exports = { SkillUsageTracker };
