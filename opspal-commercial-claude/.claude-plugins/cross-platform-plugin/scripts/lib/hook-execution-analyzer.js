#!/usr/bin/env node

/**
 * Hook Execution Analyzer
 *
 * Analyzes Claude Code hook execution logs to identify:
 * - Failed hooks
 * - Performance bottlenecks (slow hooks)
 * - Missing hooks that should have executed
 * - Hook execution patterns
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class HookExecutionAnalyzer {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.hours = options.hours || 24;
    this.hookName = options.hookName || null;
    this.performanceThreshold = options.performanceThreshold || 100; // ms

    this.logDir = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.claude',
      'logs'
    );

    this.results = {
      total: 0,
      successful: 0,
      failed: 0,
      slow: 0,
      hooks: new Map(),
      failures: [],
      warnings: []
    };
  }

  /**
   * Analyze hook execution logs
   */
  async analyze() {
    console.log(`🔍 Analyzing hook execution (last ${this.hours} hours)...\n`);

    if (!fs.existsSync(this.logDir)) {
      console.warn(`⚠️ Log directory not found: ${this.logDir}`);
      console.log('This may be normal if Claude Code hasn\'t been run yet.');
      return { passed: true, note: 'No logs found' };
    }

    // Find hook log files
    const logFiles = this.findHookLogFiles();

    if (logFiles.length === 0) {
      console.log('No hook execution logs found in the specified timeframe.');
      return { passed: true, note: 'No hook logs' };
    }

    console.log(`Found ${logFiles.length} log file(s) to analyze...`);

    // Analyze each log file
    for (const logFile of logFiles) {
      await this.analyzeLogFile(logFile);
    }

    return this.generateSummary();
  }

  /**
   * Find hook log files within the timeframe
   */
  findHookLogFiles() {
    const files = [];
    const cutoffTime = Date.now() - (this.hours * 60 * 60 * 1000);

    try {
      // Check for hook-specific log directory
      const hookLogDir = path.join(this.logDir, 'hooks');
      if (fs.existsSync(hookLogDir)) {
        this.addLogFilesFromDir(hookLogDir, files, cutoffTime);
      }

      // Also check main log directory
      this.addLogFilesFromDir(this.logDir, files, cutoffTime);

    } catch (error) {
      console.error(`Error finding log files: ${error.message}`);
    }

    return files;
  }

  /**
   * Add log files from directory
   */
  addLogFilesFromDir(dir, files, cutoffTime) {
    try {
      const entries = fs.readdirSync(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stats = fs.statSync(fullPath);

        if (stats.isFile() && stats.mtimeMs >= cutoffTime) {
          // Include .log files and files with hook names
          if (entry.endsWith('.log') || entry.includes('hook')) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Ignore errors for individual directories
    }
  }

  /**
   * Analyze a single log file
   */
  async analyzeLogFile(logFile) {
    try {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        this.analyzeLine(line, logFile);
      }

    } catch (error) {
      if (this.verbose) {
        console.error(`Error analyzing ${logFile}: ${error.message}`);
      }
    }
  }

  /**
   * Analyze a single log line
   */
  analyzeLine(line, source) {
    // Try to parse as JSON (Claude Code uses JSON logs)
    try {
      const entry = JSON.parse(line);
      this.analyzeJSONEntry(entry, source);
      return;
    } catch (e) {
      // Not JSON, try plain text parsing
    }

    // Plain text parsing for hook execution
    // Format: [timestamp] HOOK: hook-name [status] (duration)
    const hookMatch = line.match(/HOOK:\s*([^\s]+)\s*\[(\w+)\]\s*\((\d+)ms\)/);
    if (hookMatch) {
      const [, hookName, status, duration] = hookMatch;
      this.recordHookExecution(hookName, status, parseInt(duration), source);
    }

    // Also check for error patterns
    if (line.includes('ERROR') || line.includes('error')) {
      const hookNameMatch = line.match(/hook[:\s]+([^\s]+)/i);
      if (hookNameMatch) {
        this.recordHookFailure(hookNameMatch[1], line, source);
      }
    }
  }

  /**
   * Analyze JSON log entry
   */
  analyzeJSONEntry(entry, source) {
    // Check if this is a hook execution entry
    if (entry.type === 'hook_execution' || entry.hook) {
      const hookName = entry.hook || entry.name;
      const status = entry.status || (entry.error ? 'failed' : 'success');
      const duration = entry.duration || entry.executionTime || 0;

      this.recordHookExecution(hookName, status, duration, source);

      if (entry.error) {
        this.recordHookFailure(hookName, entry.error, source);
      }
    }
  }

  /**
   * Record hook execution
   */
  recordHookExecution(hookName, status, duration, source) {
    // Filter by hook name if specified
    if (this.hookName && hookName !== this.hookName) {
      return;
    }

    this.results.total++;

    // Update hook statistics
    if (!this.results.hooks.has(hookName)) {
      this.results.hooks.set(hookName, {
        name: hookName,
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        maxDuration: 0,
        slowExecutions: 0
      });
    }

    const hookStats = this.results.hooks.get(hookName);
    hookStats.executions++;
    hookStats.totalDuration += duration;
    hookStats.maxDuration = Math.max(hookStats.maxDuration, duration);

    if (status === 'success' || status === 'ok') {
      this.results.successful++;
      hookStats.successes++;
    } else {
      this.results.failed++;
      hookStats.failures++;
    }

    // Check for slow execution
    if (duration > this.performanceThreshold) {
      this.results.slow++;
      hookStats.slowExecutions++;

      this.results.warnings.push({
        type: 'slow_execution',
        hook: hookName,
        duration,
        threshold: this.performanceThreshold,
        source
      });
    }
  }

  /**
   * Record hook failure
   */
  recordHookFailure(hookName, error, source) {
    this.results.failures.push({
      hook: hookName,
      error: typeof error === 'string' ? error : JSON.stringify(error),
      source,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Generate summary report
   */
  generateSummary() {
    console.log('\n' + '─'.repeat(60));
    console.log('⚙️ HOOK EXECUTION ANALYSIS');
    console.log('─'.repeat(60));

    if (this.results.total === 0) {
      console.log('No hook executions found in the specified timeframe.');
      console.log('─'.repeat(60) + '\n');
      return { passed: true, note: 'No executions' };
    }

    // Overall statistics
    console.log(`Total executions: ${this.results.total}`);
    console.log(`Successful: ${this.results.successful} (${this.percentage(this.results.successful, this.results.total)}%)`);

    if (this.results.failed > 0) {
      console.log(`Failed: ${this.results.failed} (${this.percentage(this.results.failed, this.results.total)}%)`);
    }

    if (this.results.slow > 0) {
      console.log(`Slow (>${this.performanceThreshold}ms): ${this.results.slow}`);
    }

    // Per-hook statistics
    console.log('\nHook Details:');
    const hooks = Array.from(this.results.hooks.values())
      .sort((a, b) => b.executions - a.executions);

    for (const hook of hooks) {
      const avgDuration = Math.round(hook.totalDuration / hook.executions);
      const successRate = this.percentage(hook.successes, hook.executions);
      const icon = hook.failures === 0 ? '✓' : '✗';

      console.log(`  ${icon} ${hook.name}`);
      console.log(`    Executions: ${hook.executions} | Success: ${successRate}% | Avg: ${avgDuration}ms | Max: ${hook.maxDuration}ms`);

      if (hook.failures > 0) {
        console.log(`    ⚠️ ${hook.failures} failure(s)`);
      }

      if (hook.slowExecutions > 0) {
        console.log(`    ⏱️ ${hook.slowExecutions} slow execution(s)`);
      }
    }

    // Recent failures
    if (this.results.failures.length > 0) {
      console.log('\nRecent Failures:');
      const recentFailures = this.results.failures.slice(-5); // Last 5

      for (const failure of recentFailures) {
        console.log(`  ✗ ${failure.hook}`);
        console.log(`    Error: ${failure.error.substring(0, 100)}${failure.error.length > 100 ? '...' : ''}`);
      }

      if (this.results.failures.length > 5) {
        console.log(`  ... and ${this.results.failures.length - 5} more`);
      }
    }

    // Performance warnings
    if (this.results.warnings.length > 0 && this.verbose) {
      console.log('\nPerformance Warnings:');
      const slowHooks = new Map();

      for (const warning of this.results.warnings) {
        if (!slowHooks.has(warning.hook)) {
          slowHooks.set(warning.hook, { count: 0, maxDuration: 0 });
        }
        const stats = slowHooks.get(warning.hook);
        stats.count++;
        stats.maxDuration = Math.max(stats.maxDuration, warning.duration);
      }

      for (const [hook, stats] of slowHooks) {
        console.log(`  ⏱️ ${hook}: ${stats.count} slow execution(s), max ${stats.maxDuration}ms`);
      }
    }

    console.log('─'.repeat(60));

    const passed = this.results.failed === 0;
    const status = passed
      ? (this.results.slow > 0 ? 'HEALTHY (with warnings) ⚠️' : 'HEALTHY ✓')
      : 'ERRORS DETECTED ✗';

    console.log(`Overall Status: ${status}`);
    console.log('─'.repeat(60) + '\n');

    // Recommendations
    if (this.results.failed > 0 || this.results.slow > 0) {
      console.log('💡 Recommendations:');

      if (this.results.failed > 0) {
        const failedHooks = Array.from(this.results.hooks.values())
          .filter(h => h.failures > 0);

        for (const hook of failedHooks) {
          console.log(`  • Fix ${hook.name}: Check error logs and dependencies`);
        }
      }

      if (this.results.slow > 0) {
        const slowHooks = Array.from(this.results.hooks.values())
          .filter(h => h.slowExecutions > 0);

        for (const hook of slowHooks) {
          console.log(`  • Optimize ${hook.name}: Consider caching or async operations`);
        }
      }

      console.log();
    }

    return {
      passed,
      total: this.results.total,
      successful: this.results.successful,
      failed: this.results.failed,
      slow: this.results.slow,
      hooks: Array.from(this.results.hooks.values()),
      failures: this.results.failures,
      warnings: this.results.warnings
    };
  }

  /**
   * Calculate percentage
   */
  percentage(value, total) {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  }

  /**
   * Get JSON report
   */
  getJSONReport() {
    return {
      timestamp: new Date().toISOString(),
      timeframe: `${this.hours} hours`,
      summary: {
        total: this.results.total,
        successful: this.results.successful,
        failed: this.results.failed,
        slow: this.results.slow,
        passed: this.results.failed === 0
      },
      hooks: Array.from(this.results.hooks.values()),
      failures: this.results.failures,
      warnings: this.results.warnings
    };
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    json: args.includes('--json')
  };

  // Get hours if specified
  const hoursFlag = args.indexOf('--hours');
  if (hoursFlag !== -1 && args[hoursFlag + 1]) {
    options.hours = parseInt(args[hoursFlag + 1], 10);
  }

  // Get hook name if specified
  const hookFlag = args.indexOf('--hook');
  if (hookFlag !== -1 && args[hookFlag + 1]) {
    options.hookName = args[hookFlag + 1];
  }

  // Get performance threshold if specified
  const thresholdFlag = args.indexOf('--threshold');
  if (thresholdFlag !== -1 && args[thresholdFlag + 1]) {
    options.performanceThreshold = parseInt(args[thresholdFlag + 1], 10);
  }

  const analyzer = new HookExecutionAnalyzer(options);

  analyzer.analyze().then(result => {
    if (options.json) {
      console.log(JSON.stringify(analyzer.getJSONReport(), null, 2));
    }

    process.exit(result.passed ? 0 : 1);
  }).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(2);
  });
}

module.exports = HookExecutionAnalyzer;
