#!/usr/bin/env node

/**
 * Debug Log Analyzer
 *
 * Purpose: Parse Claude Code debug logs to auto-detect recurring tool failures
 * and generate reflections for the self-improvement pipeline.
 *
 * Features:
 * - Parses tool call failures and denials from debug logs (v2.1.27+)
 * - Auto-generates reflections for recurring patterns (3+ occurrences)
 * - Classifies failures by existing taxonomy
 * - Integrates with self-improvement-pipeline.js
 *
 * Claude Code v2.1.27+ logs tool call failures to debug logs:
 * - Location: ~/.claude/logs/debug.log
 * - Contains: tool_name, error_type, error_message, timestamp
 *
 * Usage:
 *   const { DebugLogAnalyzer } = require('./debug-log-analyzer');
 *
 *   const analyzer = new DebugLogAnalyzer();
 *
 *   // Analyze recent debug logs
 *   const patterns = await analyzer.analyzeRecentLogs();
 *
 *   // Generate reflections for recurring patterns
 *   const reflections = await analyzer.generateReflections();
 *
 * @module debug-log-analyzer
 * @version 1.0.0
 * @created 2026-02-04
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEBUG_LOG_PATH = path.join(os.homedir(), '.claude', 'logs', 'debug.log');
const STATE_FILE = path.join(__dirname, '../../data/debug-log-state.json');
const REFLECTIONS_OUTPUT = path.join(__dirname, '../../data/auto-reflections.json');

// Minimum occurrences before generating a reflection
const MIN_OCCURRENCES = 3;

// Time window for analysis (hours)
const ANALYSIS_WINDOW_HOURS = 24;

// Taxonomy classification patterns
const TAXONOMY_PATTERNS = {
  'schema-parse': [
    /json.*parse/i,
    /invalid.*json/i,
    /unexpected.*token/i,
    /syntax.*error/i,
    /malformed/i
  ],
  'tool-contract': [
    /required.*parameter/i,
    /missing.*argument/i,
    /invalid.*type/i,
    /expected.*got/i,
    /parameter.*undefined/i
  ],
  'config-env': [
    /environment.*variable/i,
    /not.*configured/i,
    /missing.*config/i,
    /api.*key/i,
    /credential/i
  ],
  'data-quality': [
    /null.*pointer/i,
    /undefined.*property/i,
    /empty.*result/i,
    /no.*data/i,
    /invalid.*data/i
  ],
  'idempotency-state': [
    /duplicate/i,
    /already.*exists/i,
    /conflict/i,
    /concurrent/i,
    /race.*condition/i
  ],
  'external-api': [
    /api.*error/i,
    /timeout/i,
    /rate.*limit/i,
    /429/i,
    /503/i,
    /connection.*refused/i,
    /network.*error/i
  ],
  'permission': [
    /permission.*denied/i,
    /unauthorized/i,
    /forbidden/i,
    /access.*denied/i,
    /not.*allowed/i
  ],
  'resource': [
    /not.*found/i,
    /does.*not.*exist/i,
    /no.*such/i,
    /404/i,
    /missing.*file/i
  ]
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function ensureDataDir() {
  const dataDir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {
    // State file corrupted or missing
  }
  return {
    last_analyzed_line: 0,
    last_analyzed_time: null,
    patterns_seen: {},
    reflections_generated: [],
    version: '1.0.0'
  };
}

function saveState(state) {
  ensureDataDir();
  state.last_updated = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function classifyError(errorMessage) {
  for (const [taxonomy, patterns] of Object.entries(TAXONOMY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(errorMessage)) {
        return taxonomy;
      }
    }
  }
  return 'unknown';
}

// =============================================================================
// DEBUG LOG ANALYZER
// =============================================================================

class DebugLogAnalyzer {
  constructor(options = {}) {
    this.logPath = options.logPath || DEBUG_LOG_PATH;
    this.stateFile = options.stateFile || STATE_FILE;
    this.outputFile = options.outputFile || REFLECTIONS_OUTPUT;
    this.minOccurrences = options.minOccurrences || MIN_OCCURRENCES;
    this.windowHours = options.windowHours || ANALYSIS_WINDOW_HOURS;

    this.state = loadState();
  }

  /**
   * Parse debug log entries
   * Looks for tool failure patterns in Claude Code debug logs
   */
  async parseLogEntries() {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }

    const entries = [];
    const cutoffTime = new Date(Date.now() - this.windowHours * 60 * 60 * 1000);
    const fileStream = fs.createReadStream(this.logPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineNumber = 0;
    let currentEntry = null;

    for await (const line of rl) {
      lineNumber++;

      // Skip already-analyzed lines
      if (lineNumber <= this.state.last_analyzed_line) {
        continue;
      }

      // Parse log line patterns
      // Common patterns in Claude Code debug logs:
      // [2026-02-04T10:30:00.000Z] [ERROR] Tool call failed: <tool_name> - <error>
      // [timestamp] [level] message

      const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^]]*)\]/);
      if (timestampMatch) {
        const timestamp = new Date(timestampMatch[1]);
        if (timestamp < cutoffTime) {
          continue;
        }
      }

      // Look for tool failure patterns
      const toolFailureMatch = line.match(/tool\s*(?:call\s*)?(?:failed|error|denied)[:\s]*(\w+)\s*[-:]\s*(.+)/i);
      if (toolFailureMatch) {
        entries.push({
          line_number: lineNumber,
          timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
          tool_name: toolFailureMatch[1],
          error_message: toolFailureMatch[2].trim(),
          raw_line: line
        });
        continue;
      }

      // Look for error/denied patterns
      const errorMatch = line.match(/\[(ERROR|WARN)\]\s*(.+)/i);
      if (errorMatch) {
        // Try to extract tool name
        const toolMatch = errorMatch[2].match(/(?:Tool|MCP|mcp_\w+|Bash|Read|Write|Edit|Agent|Task)[\s:]+(\S+)/i);

        entries.push({
          line_number: lineNumber,
          timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
          level: errorMatch[1].toUpperCase(),
          tool_name: toolMatch ? toolMatch[1] : 'unknown',
          error_message: errorMatch[2].trim(),
          raw_line: line
        });
      }

      // Look for hook denial patterns
      const hookDenialMatch = line.match(/hook\s*(?:blocked|denied|rejected)[:\s]*(.+)/i);
      if (hookDenialMatch) {
        entries.push({
          line_number: lineNumber,
          timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
          type: 'hook_denial',
          error_message: hookDenialMatch[1].trim(),
          raw_line: line
        });
      }
    }

    // Update state with last analyzed line
    this.state.last_analyzed_line = lineNumber;
    this.state.last_analyzed_time = new Date().toISOString();

    return entries;
  }

  /**
   * Analyze entries and detect patterns
   */
  analyzePatterns(entries) {
    const patterns = {};

    for (const entry of entries) {
      // Create pattern key from tool + error type
      const taxonomy = classifyError(entry.error_message);
      const toolName = entry.tool_name || 'unknown';

      // Normalize error message to create pattern key
      const normalizedError = entry.error_message
        .replace(/\b\d+\b/g, 'N')           // Replace numbers
        .replace(/"[^"]+"/g, '"STR"')        // Replace quoted strings
        .replace(/\'[^\']+\'/g, "'STR'")     // Replace single-quoted strings
        .replace(/\s+/g, ' ')                // Normalize whitespace
        .slice(0, 100);                       // Limit length

      const patternKey = `${toolName}:${taxonomy}:${normalizedError}`;

      if (!patterns[patternKey]) {
        patterns[patternKey] = {
          tool_name: toolName,
          taxonomy,
          normalized_error: normalizedError,
          occurrences: [],
          count: 0,
          first_seen: entry.timestamp,
          last_seen: entry.timestamp
        };
      }

      patterns[patternKey].occurrences.push({
        timestamp: entry.timestamp,
        line_number: entry.line_number,
        full_message: entry.error_message
      });
      patterns[patternKey].count++;
      patterns[patternKey].last_seen = entry.timestamp;
    }

    return patterns;
  }

  /**
   * Merge with previously seen patterns
   */
  mergePatterns(newPatterns) {
    for (const [key, pattern] of Object.entries(newPatterns)) {
      if (!this.state.patterns_seen[key]) {
        this.state.patterns_seen[key] = {
          ...pattern,
          total_count: pattern.count,
          reflection_generated: false
        };
      } else {
        // Merge
        this.state.patterns_seen[key].total_count += pattern.count;
        this.state.patterns_seen[key].occurrences.push(...pattern.occurrences);
        this.state.patterns_seen[key].last_seen = pattern.last_seen;

        // Keep only recent occurrences (last 50)
        if (this.state.patterns_seen[key].occurrences.length > 50) {
          this.state.patterns_seen[key].occurrences =
            this.state.patterns_seen[key].occurrences.slice(-50);
        }
      }
    }
  }

  /**
   * Get patterns eligible for reflection generation
   */
  getEligiblePatterns() {
    const eligible = [];

    for (const [key, pattern] of Object.entries(this.state.patterns_seen)) {
      if (pattern.total_count >= this.minOccurrences && !pattern.reflection_generated) {
        // Check if we have enough recent occurrences
        const recentCutoff = new Date(Date.now() - this.windowHours * 60 * 60 * 1000);
        const recentCount = pattern.occurrences.filter(o =>
          new Date(o.timestamp) > recentCutoff
        ).length;

        if (recentCount >= this.minOccurrences) {
          eligible.push({
            key,
            ...pattern
          });
        }
      }
    }

    return eligible.sort((a, b) => b.total_count - a.total_count);
  }

  /**
   * Generate reflection for a pattern
   */
  generateReflection(pattern) {
    const reflection = {
      id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: 'debug-log-analyzer',
      created_at: new Date().toISOString(),
      taxonomy: pattern.taxonomy,
      tool_name: pattern.tool_name,
      status: 'pending_review',
      data: {
        pattern_key: pattern.key,
        normalized_error: pattern.normalized_error,
        occurrence_count: pattern.total_count,
        recent_examples: pattern.occurrences.slice(-5),
        first_seen: pattern.first_seen,
        last_seen: pattern.last_seen,
        auto_generated: true
      },
      summary: `Recurring ${pattern.taxonomy} error in ${pattern.tool_name}: ${pattern.normalized_error.slice(0, 80)}`,
      priority: pattern.total_count >= 10 ? 'high' : pattern.total_count >= 5 ? 'medium' : 'low',
      suggested_prevention: this._suggestPrevention(pattern)
    };

    return reflection;
  }

  /**
   * Suggest prevention based on pattern
   */
  _suggestPrevention(pattern) {
    const suggestions = {
      'schema-parse': 'Add JSON validation before parsing. Consider using try-catch with specific error handling.',
      'tool-contract': 'Validate required parameters before tool invocation. Add pre-tool-use hook for parameter validation.',
      'config-env': 'Add environment variable validation at startup. Create pre-execution check hook.',
      'data-quality': 'Add null checks and data validation. Consider defensive programming patterns.',
      'idempotency-state': 'Implement idempotency keys for state-changing operations. Add pre-check for existing resources.',
      'external-api': 'Add retry logic with exponential backoff. Implement circuit breaker pattern.',
      'permission': 'Validate permissions before operations. Add permission check to pre-tool-use hook.',
      'resource': 'Check resource existence before operations. Add graceful handling for missing resources.'
    };

    return suggestions[pattern.taxonomy] || 'Review error pattern and implement appropriate error handling.';
  }

  /**
   * Run full analysis and generate reflections
   */
  async analyzeAndGenerate() {
    console.log('Parsing debug logs...');
    const entries = await this.parseLogEntries();
    console.log(`Found ${entries.length} new log entries`);

    if (entries.length === 0) {
      saveState(this.state);
      return { patterns: [], reflections: [] };
    }

    console.log('Analyzing patterns...');
    const newPatterns = this.analyzePatterns(entries);
    console.log(`Detected ${Object.keys(newPatterns).length} patterns`);

    this.mergePatterns(newPatterns);

    console.log('Checking for eligible patterns...');
    const eligible = this.getEligiblePatterns();
    console.log(`${eligible.length} patterns eligible for reflection generation`);

    const reflections = [];
    for (const pattern of eligible) {
      const reflection = this.generateReflection(pattern);
      reflections.push(reflection);

      // Mark as generated
      this.state.patterns_seen[pattern.key].reflection_generated = true;
      this.state.reflections_generated.push({
        reflection_id: reflection.id,
        pattern_key: pattern.key,
        generated_at: new Date().toISOString()
      });
    }

    // Save reflections
    if (reflections.length > 0) {
      ensureDataDir();
      let existingReflections = [];
      if (fs.existsSync(this.outputFile)) {
        try {
          existingReflections = JSON.parse(fs.readFileSync(this.outputFile, 'utf8'));
        } catch (e) {
          // Start fresh
        }
      }
      existingReflections.push(...reflections);

      // Keep last 100
      if (existingReflections.length > 100) {
        existingReflections = existingReflections.slice(-100);
      }

      fs.writeFileSync(this.outputFile, JSON.stringify(existingReflections, null, 2), 'utf8');
      console.log(`Saved ${reflections.length} reflections to ${this.outputFile}`);
    }

    saveState(this.state);

    return {
      entries_analyzed: entries.length,
      patterns_detected: Object.keys(newPatterns).length,
      reflections_generated: reflections.length,
      reflections
    };
  }

  /**
   * Get status report
   */
  getStatus() {
    const patternCount = Object.keys(this.state.patterns_seen).length;
    const eligibleCount = this.getEligiblePatterns().length;

    const taxonomyBreakdown = {};
    for (const pattern of Object.values(this.state.patterns_seen)) {
      taxonomyBreakdown[pattern.taxonomy] = (taxonomyBreakdown[pattern.taxonomy] || 0) + 1;
    }

    return {
      last_analyzed: this.state.last_analyzed_time,
      total_patterns_tracked: patternCount,
      patterns_eligible_for_reflection: eligibleCount,
      reflections_generated: this.state.reflections_generated.length,
      taxonomy_breakdown: taxonomyBreakdown,
      log_file_exists: fs.existsSync(this.logPath),
      log_file_path: this.logPath
    };
  }

  /**
   * Reset state
   */
  reset() {
    this.state = {
      last_analyzed_line: 0,
      last_analyzed_time: null,
      patterns_seen: {},
      reflections_generated: [],
      version: '1.0.0'
    };
    saveState(this.state);
  }
}

// =============================================================================
// CLI INTERFACE
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  const analyzer = new DebugLogAnalyzer();

  (async () => {
    switch (command) {
      case 'analyze': {
        const result = await analyzer.analyzeAndGenerate();
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('  Debug Log Analysis Complete');
        console.log('═══════════════════════════════════════════════════════\n');
        console.log(`  Entries analyzed:        ${result.entries_analyzed}`);
        console.log(`  Patterns detected:       ${result.patterns_detected}`);
        console.log(`  Reflections generated:   ${result.reflections_generated}`);

        if (result.reflections.length > 0) {
          console.log('\n  Generated Reflections:');
          result.reflections.forEach(r => {
            console.log(`    - [${r.priority}] ${r.summary.slice(0, 60)}...`);
          });
        }

        console.log('\n═══════════════════════════════════════════════════════\n');
        break;
      }

      case 'status': {
        const status = analyzer.getStatus();
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('  Debug Log Analyzer Status');
        console.log('═══════════════════════════════════════════════════════\n');
        console.log(`  Log file:                ${status.log_file_exists ? '✓ Found' : '✗ Not found'}`);
        console.log(`  Log path:                ${status.log_file_path}`);
        console.log(`  Last analyzed:           ${status.last_analyzed || 'Never'}`);
        console.log(`  Patterns tracked:        ${status.total_patterns_tracked}`);
        console.log(`  Eligible for reflection: ${status.patterns_eligible_for_reflection}`);
        console.log(`  Reflections generated:   ${status.reflections_generated}`);

        if (Object.keys(status.taxonomy_breakdown).length > 0) {
          console.log('\n  Taxonomy Breakdown:');
          for (const [tax, count] of Object.entries(status.taxonomy_breakdown)) {
            console.log(`    ${tax}: ${count}`);
          }
        }

        console.log('\n═══════════════════════════════════════════════════════\n');
        break;
      }

      case 'patterns': {
        const eligible = analyzer.getEligiblePatterns();
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('  Eligible Patterns for Reflection');
        console.log('═══════════════════════════════════════════════════════\n');

        if (eligible.length === 0) {
          console.log('  No patterns currently eligible.');
          console.log(`  (Patterns need ${MIN_OCCURRENCES}+ occurrences in ${ANALYSIS_WINDOW_HOURS}h window)`);
        } else {
          eligible.forEach((p, i) => {
            console.log(`  ${i + 1}. [${p.taxonomy}] ${p.tool_name}`);
            console.log(`     Count: ${p.total_count} | Error: ${p.normalized_error.slice(0, 50)}...`);
            console.log('');
          });
        }

        console.log('═══════════════════════════════════════════════════════\n');
        break;
      }

      case 'reset': {
        analyzer.reset();
        console.log('Debug log analyzer state has been reset.');
        break;
      }

      default:
        console.log(`
Debug Log Analyzer

Parses Claude Code debug logs to auto-detect recurring failures.

Usage: node debug-log-analyzer.js <command>

Commands:
  analyze       Parse logs and generate reflections
  status        Show current status
  patterns      List eligible patterns
  reset         Reset analyzer state

The analyzer:
  - Reads from: ~/.claude/logs/debug.log
  - Generates reflections for patterns with ${MIN_OCCURRENCES}+ occurrences
  - Classifies by taxonomy (schema-parse, tool-contract, etc.)
  - Integrates with self-improvement pipeline
`);
    }
  })().catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  DebugLogAnalyzer,
  TAXONOMY_PATTERNS,
  classifyError,
  MIN_OCCURRENCES,
  ANALYSIS_WINDOW_HOURS
};
