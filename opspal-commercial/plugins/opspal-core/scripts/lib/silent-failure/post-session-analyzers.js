#!/usr/bin/env node

/**
 * Post-Session Analyzers for Silent Failure Detection
 *
 * Purpose: Analyze session data AFTER completion to detect patterns
 *
 * Analyzers:
 * - SilentFailurePatternDetector: Detects recurring failure patterns
 * - SessionAnomalyScorer: Compares session to baseline for anomalies
 *
 * Usage:
 *   const { runPostSessionAnalysis } = require('./post-session-analyzers');
 *
 *   const analysis = await runPostSessionAnalysis(sessionData);
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// =============================================================================
// Constants
// =============================================================================

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

// Taxonomy mapping for reflection integration
const TAXONOMY_MAP = {
  'validation_bypass_cascade': 'config-env',
  'repeated_cache_fallback': 'external-api',
  'hook_silent_failures': 'tool-contract',
  'idempotency_collisions': 'idempotency-state',
  'env_leakage': 'config-env',
  'circuit_breaker_open': 'external-api',
  'stale_cache_usage': 'data-quality',
  'package_missing': 'config-env'
};

// Load config if available
let CONFIG;
try {
  const configPath = path.join(__dirname, '..', '..', '..', 'config', 'silent-failure-detection.json');
  if (fs.existsSync(configPath)) {
    CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch {
  // Use defaults
}

const DEFAULT_PATTERNS = {
  repeated_cache_fallback: {
    indicator: (session) => (session.metrics?.cache?.fallbacks || 0) > 3,
    severity: SEVERITY.HIGH,
    taxonomy: 'external-api',
    suggestion: 'Check external API health and network connectivity'
  },
  validation_bypass_cascade: {
    indicator: (session) => (session.metrics?.validationSkips?.totalSkips || 0) > 5,
    severity: SEVERITY.CRITICAL,
    taxonomy: 'config-env',
    suggestion: 'Remove SKIP_VALIDATION environment variable'
  },
  hook_silent_failures: {
    indicator: (session) => (session.metrics?.hookFailures?.totalSilentFailures || 0) > 2,
    severity: SEVERITY.HIGH,
    taxonomy: 'tool-contract',
    suggestion: 'Review hooks that exit 0 but produce invalid output'
  },
  idempotency_collisions: {
    indicator: (session) => (session.metrics?.idempotency?.staleCount || 0) > 1,
    severity: SEVERITY.MEDIUM,
    taxonomy: 'idempotency-state',
    suggestion: 'Verify idempotency key generation logic'
  },
  low_health_score: {
    indicator: (session) => (session.healthScore || 100) < 50,
    severity: SEVERITY.HIGH,
    taxonomy: 'data-quality',
    suggestion: 'Review session for multiple silent failure indicators'
  }
};

// =============================================================================
// Silent Failure Pattern Detector
// =============================================================================

/**
 * Detects patterns in session data that indicate silent failures
 */
class SilentFailurePatternDetector {
  constructor(options = {}) {
    // Always use DEFAULT_PATTERNS for indicator functions
    // Config can override severity, taxonomy, suggestion but not indicators
    this.patterns = { ...DEFAULT_PATTERNS };

    // Merge config overrides (but keep indicator functions from defaults)
    const configPatterns = CONFIG?.silentFailurePatterns || {};
    for (const [name, configPattern] of Object.entries(configPatterns)) {
      if (this.patterns[name]) {
        // Merge config into default, keeping indicator function
        this.patterns[name] = {
          ...this.patterns[name],
          severity: configPattern.severity || this.patterns[name].severity,
          taxonomy: configPattern.taxonomy || this.patterns[name].taxonomy,
          suggestion: configPattern.suggestion || this.patterns[name].suggestion
        };
      }
    }

    // Allow options to override
    if (options.patterns) {
      this.patterns = { ...this.patterns, ...options.patterns };
    }
  }

  /**
   * Analyze session data for patterns
   * @param {Object} sessionData - Session metrics and data
   * @returns {Object} Analysis results
   */
  analyze(sessionData) {
    const detectedPatterns = [];
    let shouldGenerateReflection = false;

    for (const [name, pattern] of Object.entries(this.patterns)) {
      try {
        if (pattern.indicator(sessionData)) {
          const detected = {
            pattern: name,
            severity: pattern.severity,
            taxonomy: pattern.taxonomy || TAXONOMY_MAP[name] || 'unknown',
            suggestion: pattern.suggestion,
            metrics: this.extractRelevantMetrics(sessionData, name)
          };

          detectedPatterns.push(detected);

          // Critical patterns should generate reflections
          if (pattern.severity === SEVERITY.CRITICAL) {
            shouldGenerateReflection = true;
          }
        }
      } catch (err) {
        // Pattern indicator failed - log but continue
        console.error(`Pattern "${name}" indicator failed:`, err.message);
      }
    }

    return {
      analyzer: 'pattern-detector',
      timestamp: new Date().toISOString(),
      sessionId: sessionData.sessionId,
      patterns: detectedPatterns,
      patternCount: detectedPatterns.length,
      shouldGenerateReflection,
      severity: this.getHighestSeverity(detectedPatterns)
    };
  }

  /**
   * Extract metrics relevant to a specific pattern
   */
  extractRelevantMetrics(sessionData, patternName) {
    const metrics = {};

    switch (patternName) {
      case 'repeated_cache_fallback':
        metrics.fallbacks = sessionData.metrics?.cache?.fallbacks || 0;
        metrics.staleHits = sessionData.metrics?.cache?.staleHits || 0;
        metrics.cacheHealthScore = sessionData.metrics?.cache?.healthScore || 100;
        break;

      case 'validation_bypass_cascade':
        metrics.totalSkips = sessionData.metrics?.validationSkips?.totalSkips || 0;
        metrics.byType = sessionData.metrics?.validationSkips?.byType || {};
        break;

      case 'hook_silent_failures':
        metrics.silentFailures = sessionData.metrics?.hookFailures?.totalSilentFailures || 0;
        metrics.problematicHooks = sessionData.metrics?.hookFailures?.problematicHooks || [];
        break;

      case 'low_health_score':
        metrics.healthScore = sessionData.healthScore;
        metrics.duration = sessionData.duration;
        break;

      default:
        metrics.raw = sessionData.metrics;
    }

    return metrics;
  }

  /**
   * Get the highest severity from detected patterns
   */
  getHighestSeverity(patterns) {
    const order = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW];

    for (const severity of order) {
      if (patterns.some(p => p.severity === severity)) {
        return severity;
      }
    }

    return null;
  }
}

// =============================================================================
// Session Anomaly Scorer
// =============================================================================

/**
 * Compares session metrics to historical baseline to detect anomalies
 */
class SessionAnomalyScorer {
  constructor(options = {}) {
    this.baselinePath = options.baselinePath ||
      path.join(os.homedir(), '.claude', 'metrics', 'session-baseline.json');
    this.baseline = this.loadBaseline();
  }

  loadBaseline() {
    try {
      if (fs.existsSync(this.baselinePath)) {
        return JSON.parse(fs.readFileSync(this.baselinePath, 'utf8'));
      }
    } catch {
      // No baseline available
    }

    // Default baseline
    return {
      avgHealthScore: 85,
      avgValidationSkips: 1,
      avgCacheFallbacks: 0.5,
      avgHookFailures: 0.2,
      stdDevHealthScore: 10,
      sampleCount: 0
    };
  }

  /**
   * Score session anomalies compared to baseline
   * @param {Object} sessionData - Session metrics
   * @returns {Object} Anomaly analysis
   */
  analyze(sessionData) {
    const anomalies = [];
    let anomalyScore = 0;

    // Health score anomaly
    const healthScore = sessionData.healthScore || 100;
    const healthDeviation = (this.baseline.avgHealthScore - healthScore) / this.baseline.stdDevHealthScore;

    if (healthDeviation > 2) {
      anomalies.push({
        metric: 'healthScore',
        value: healthScore,
        baseline: this.baseline.avgHealthScore,
        deviation: healthDeviation,
        severity: healthDeviation > 3 ? SEVERITY.HIGH : SEVERITY.MEDIUM
      });
      anomalyScore += healthDeviation * 10;
    }

    // Validation skips anomaly
    const validationSkips = sessionData.metrics?.validationSkips?.totalSkips || 0;
    if (validationSkips > this.baseline.avgValidationSkips * 3) {
      anomalies.push({
        metric: 'validationSkips',
        value: validationSkips,
        baseline: this.baseline.avgValidationSkips,
        multiplier: validationSkips / Math.max(this.baseline.avgValidationSkips, 0.1),
        severity: validationSkips > this.baseline.avgValidationSkips * 5 ? SEVERITY.HIGH : SEVERITY.MEDIUM
      });
      anomalyScore += 20;
    }

    // Cache fallbacks anomaly
    const cacheFallbacks = sessionData.metrics?.cache?.fallbacks || 0;
    if (cacheFallbacks > this.baseline.avgCacheFallbacks * 3) {
      anomalies.push({
        metric: 'cacheFallbacks',
        value: cacheFallbacks,
        baseline: this.baseline.avgCacheFallbacks,
        multiplier: cacheFallbacks / Math.max(this.baseline.avgCacheFallbacks, 0.1),
        severity: SEVERITY.MEDIUM
      });
      anomalyScore += 15;
    }

    return {
      analyzer: 'anomaly-scorer',
      timestamp: new Date().toISOString(),
      sessionId: sessionData.sessionId,
      anomalies,
      anomalyScore: Math.min(100, anomalyScore),
      isAnomaly: anomalyScore > 30,
      baselineSamples: this.baseline.sampleCount
    };
  }

  /**
   * Update baseline with new session data
   * @param {Object} sessionData - Session metrics to incorporate
   */
  updateBaseline(sessionData) {
    const n = this.baseline.sampleCount;
    const healthScore = sessionData.healthScore || 100;
    const validationSkips = sessionData.metrics?.validationSkips?.totalSkips || 0;
    const cacheFallbacks = sessionData.metrics?.cache?.fallbacks || 0;
    const hookFailures = sessionData.metrics?.hookFailures?.totalFailures || 0;

    // Incremental mean update
    this.baseline.avgHealthScore = (this.baseline.avgHealthScore * n + healthScore) / (n + 1);
    this.baseline.avgValidationSkips = (this.baseline.avgValidationSkips * n + validationSkips) / (n + 1);
    this.baseline.avgCacheFallbacks = (this.baseline.avgCacheFallbacks * n + cacheFallbacks) / (n + 1);
    this.baseline.avgHookFailures = (this.baseline.avgHookFailures * n + hookFailures) / (n + 1);
    this.baseline.sampleCount = n + 1;

    // Save updated baseline
    try {
      const dir = path.dirname(this.baselinePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.baselinePath, JSON.stringify(this.baseline, null, 2));
    } catch (err) {
      console.error('Failed to save baseline:', err.message);
    }
  }
}

// =============================================================================
// Reflection Generator
// =============================================================================

/**
 * Generates reflection entries from detected patterns
 */
class ReflectionGenerator {
  constructor(options = {}) {
    this.reflectionPath = options.reflectionPath ||
      path.join(process.cwd(), '.claude', 'data', 'auto-reflections.json');
  }

  /**
   * Generate reflection from pattern analysis
   * @param {Object} analysis - Pattern analysis results
   * @returns {Object} Generated reflection
   */
  generate(analysis) {
    if (!analysis.shouldGenerateReflection || analysis.patterns.length === 0) {
      return null;
    }

    const topPattern = analysis.patterns
      .sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return order[a.severity] - order[b.severity];
      })[0];

    const reflection = {
      id: `sf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      source: 'silent-failure-detector',
      timestamp: new Date().toISOString(),
      taxonomy: topPattern.taxonomy,
      severity: topPattern.severity === SEVERITY.CRITICAL ? 'high' : 'medium',
      summary: `Silent failure pattern detected: ${topPattern.pattern}`,
      details: {
        pattern: topPattern.pattern,
        suggestion: topPattern.suggestion,
        metrics: topPattern.metrics,
        allPatterns: analysis.patterns.map(p => p.pattern),
        sessionId: analysis.sessionId,
        autoGenerated: true,
        requiresReview: true
      }
    };

    return reflection;
  }

  /**
   * Save reflection to file
   * @param {Object} reflection - Reflection to save
   */
  save(reflection) {
    if (!reflection) return;

    try {
      const dir = path.dirname(this.reflectionPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let reflections = [];
      if (fs.existsSync(this.reflectionPath)) {
        reflections = JSON.parse(fs.readFileSync(this.reflectionPath, 'utf8'));
      }

      reflections.push(reflection);
      fs.writeFileSync(this.reflectionPath, JSON.stringify(reflections, null, 2));

      return true;
    } catch (err) {
      console.error('Failed to save reflection:', err.message);
      return false;
    }
  }
}

// =============================================================================
// Runner Function
// =============================================================================

/**
 * Run all post-session analyzers
 * @param {Object} sessionData - Session metrics and data
 * @param {Object} options - Analysis options
 * @returns {Object} Combined analysis results
 */
async function runPostSessionAnalysis(sessionData, options = {}) {
  const patternDetector = new SilentFailurePatternDetector(options);
  const anomalyScorer = new SessionAnomalyScorer(options);
  const reflectionGenerator = new ReflectionGenerator(options);

  // Run pattern detection
  const patternAnalysis = patternDetector.analyze(sessionData);

  // Run anomaly scoring
  const anomalyAnalysis = anomalyScorer.analyze(sessionData);

  // Generate reflection if needed
  let reflection = null;
  if (patternAnalysis.shouldGenerateReflection) {
    reflection = reflectionGenerator.generate(patternAnalysis);
    if (reflection && options.saveReflection !== false) {
      reflectionGenerator.save(reflection);
    }
  }

  // Update baseline with this session (unless it's an anomaly)
  if (!anomalyAnalysis.isAnomaly && options.updateBaseline !== false) {
    anomalyScorer.updateBaseline(sessionData);
  }

  return {
    timestamp: new Date().toISOString(),
    sessionId: sessionData.sessionId,
    patternAnalysis,
    anomalyAnalysis,
    reflection,
    summary: {
      patternsDetected: patternAnalysis.patternCount,
      highestSeverity: patternAnalysis.severity,
      isAnomaly: anomalyAnalysis.isAnomaly,
      anomalyScore: anomalyAnalysis.anomalyScore,
      reflectionGenerated: reflection !== null
    }
  };
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  // Read session data from stdin or file
  let sessionData;

  if (args[0] === '--file' && args[1]) {
    sessionData = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  } else if (args[0] === '--stdin') {
    // Read from stdin
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        input += chunk;
      }
    });
    process.stdin.on('end', () => {
      sessionData = JSON.parse(input);
      runAndOutput(sessionData);
    });
  } else {
    // Demo with sample data
    sessionData = {
      sessionId: 'demo_session',
      healthScore: 45,
      metrics: {
        validationSkips: { totalSkips: 8, byType: { env: 8 } },
        cache: { fallbacks: 5, staleHits: 3, healthScore: 60 },
        hookFailures: { totalSilentFailures: 3, problematicHooks: [{ hookName: 'pre-commit', count: 3 }] }
      }
    };
    runAndOutput(sessionData);
  }

  function runAndOutput(data) {
    runPostSessionAnalysis(data, { saveReflection: false }).then(results => {
      console.log(JSON.stringify(results, null, 2));
    });
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  runPostSessionAnalysis,
  SilentFailurePatternDetector,
  SessionAnomalyScorer,
  ReflectionGenerator,
  SEVERITY,
  TAXONOMY_MAP
};
