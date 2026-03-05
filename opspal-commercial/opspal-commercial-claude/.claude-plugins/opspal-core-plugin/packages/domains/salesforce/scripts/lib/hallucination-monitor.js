/**
 * Hallucination Prevention Monitor
 *
 * Tracks and reports metrics for hallucination prevention system:
 * - Citation coverage rates
 * - Claim verification statistics
 * - Best-of-N consistency scores
 * - Benchmark retrieval success rates
 *
 * @module hallucination-monitor
 * @version 1.0.0
 * @created 2025-12-26
 */

const fs = require('fs');
const path = require('path');

const METRICS_FILE = path.join(__dirname, '../../.hallucination-metrics.json');

/**
 * Hallucination Prevention Monitor
 */
class HallucinationMonitor {
  constructor() {
    this.metrics = this.loadMetrics();
  }

  /**
   * Load metrics from persistent storage
   */
  loadMetrics() {
    try {
      if (fs.existsSync(METRICS_FILE)) {
        return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
      }
    } catch (e) {
      console.warn('[Monitor] Could not load metrics file, starting fresh');
    }

    return {
      citation_verification: {
        total_checks: 0,
        total_claims: 0,
        verified_claims: 0,
        retracted_claims: 0,
        average_coverage: 0,
        checks_by_date: {}
      },
      best_of_n: {
        total_runs: 0,
        consistent_claims: 0,
        inconsistent_claims: 0,
        unique_claims: 0,
        average_consistency: 0,
        runs_by_date: {}
      },
      benchmark_retrieval: {
        total_requests: 0,
        successful: 0,
        failed: 0,
        cached_hits: 0,
        by_category: {},
        requests_by_date: {}
      },
      fabrication_detection: {
        total_checks: 0,
        fabrications_detected: 0,
        by_type: {
          salesforce_ids: 0,
          placeholder_names: 0,
          generic_records: 0,
          unmatched_values: 0
        },
        checks_by_date: {}
      },
      last_updated: null
    };
  }

  /**
   * Save metrics to persistent storage
   */
  saveMetrics() {
    this.metrics.last_updated = new Date().toISOString();
    try {
      fs.writeFileSync(METRICS_FILE, JSON.stringify(this.metrics, null, 2));
    } catch (e) {
      console.error('[Monitor] Could not save metrics:', e.message);
    }
  }

  /**
   * Get today's date key
   */
  getDateKey() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Record citation verification result
   * @param {object} result - Result from verifyClaimsAgainstSources
   */
  recordCitationVerification(result) {
    const date = this.getDateKey();
    const cv = this.metrics.citation_verification;

    cv.total_checks++;
    cv.total_claims += result.total_claims || 0;
    cv.verified_claims += result.verified?.length || 0;
    cv.retracted_claims += result.retracted?.length || 0;

    // Update running average
    cv.average_coverage = (
      (cv.average_coverage * (cv.total_checks - 1) + (result.coverage_percent || 0))
    ) / cv.total_checks;

    // Track by date
    if (!cv.checks_by_date[date]) {
      cv.checks_by_date[date] = { checks: 0, coverage_sum: 0 };
    }
    cv.checks_by_date[date].checks++;
    cv.checks_by_date[date].coverage_sum += result.coverage_percent || 0;

    this.saveMetrics();
  }

  /**
   * Record Best-of-N verification result
   * @param {object} result - Result from analyzeConsistency
   */
  recordBestOfN(result) {
    const date = this.getDateKey();
    const bon = this.metrics.best_of_n;

    bon.total_runs++;
    bon.consistent_claims += result.consistentClaims?.length || 0;
    bon.inconsistent_claims += result.inconsistentClaims?.length || 0;
    bon.unique_claims += result.uniqueClaims?.length || 0;

    // Update running average
    bon.average_consistency = (
      (bon.average_consistency * (bon.total_runs - 1) + (result.overallConsistency || 0))
    ) / bon.total_runs;

    // Track by date
    if (!bon.runs_by_date[date]) {
      bon.runs_by_date[date] = { runs: 0, consistency_sum: 0 };
    }
    bon.runs_by_date[date].runs++;
    bon.runs_by_date[date].consistency_sum += result.overallConsistency || 0;

    this.saveMetrics();
  }

  /**
   * Record benchmark retrieval attempt
   * @param {object} result - Benchmark retrieval result
   */
  recordBenchmarkRetrieval(result) {
    const date = this.getDateKey();
    const br = this.metrics.benchmark_retrieval;

    br.total_requests++;

    if (result.cached) {
      br.cached_hits++;
    }

    if (result.confidence === 'high' || result.confidence === 'medium') {
      br.successful++;
    } else {
      br.failed++;
    }

    // Track by category
    if (result.category) {
      br.by_category[result.category] = (br.by_category[result.category] || 0) + 1;
    }

    // Track by date
    if (!br.requests_by_date[date]) {
      br.requests_by_date[date] = { requests: 0, successful: 0 };
    }
    br.requests_by_date[date].requests++;
    if (result.confidence === 'high' || result.confidence === 'medium') {
      br.requests_by_date[date].successful++;
    }

    this.saveMetrics();
  }

  /**
   * Record fabrication detection result
   * @param {object} result - Result from checkForFabrications
   */
  recordFabricationDetection(result) {
    const date = this.getDateKey();
    const fd = this.metrics.fabrication_detection;

    fd.total_checks++;

    if (result.fabrications_detected) {
      fd.fabrications_detected++;

      // Track by type
      if (result.fabricated_ids?.length > 0) {
        fd.by_type.salesforce_ids += result.fabricated_ids.length;
      }
      if (result.placeholder_names?.length > 0) {
        fd.by_type.placeholder_names += result.placeholder_names.length;
      }
      if (result.generic_records?.length > 0) {
        fd.by_type.generic_records += result.generic_records.length;
      }
      if (result.unmatched_values?.length > 0) {
        fd.by_type.unmatched_values += result.unmatched_values.length;
      }
    }

    // Track by date
    if (!fd.checks_by_date[date]) {
      fd.checks_by_date[date] = { checks: 0, detections: 0 };
    }
    fd.checks_by_date[date].checks++;
    if (result.fabrications_detected) {
      fd.checks_by_date[date].detections++;
    }

    this.saveMetrics();
  }

  /**
   * Get summary report
   * @param {number} days - Number of days to include (default: 30)
   * @returns {object} Summary report
   */
  getSummary(days = 30) {
    const cv = this.metrics.citation_verification;
    const bon = this.metrics.best_of_n;
    const br = this.metrics.benchmark_retrieval;
    const fd = this.metrics.fabrication_detection;

    return {
      period: `Last ${days} days`,
      last_updated: this.metrics.last_updated,

      citation_verification: {
        total_checks: cv.total_checks,
        average_coverage: cv.average_coverage.toFixed(1) + '%',
        verification_rate: cv.total_claims > 0
          ? ((cv.verified_claims / cv.total_claims) * 100).toFixed(1) + '%'
          : 'N/A',
        retraction_rate: cv.total_claims > 0
          ? ((cv.retracted_claims / cv.total_claims) * 100).toFixed(1) + '%'
          : 'N/A'
      },

      best_of_n: {
        total_runs: bon.total_runs,
        average_consistency: (bon.average_consistency * 100).toFixed(1) + '%',
        consistent_claim_rate: (bon.consistent_claims + bon.inconsistent_claims + bon.unique_claims) > 0
          ? ((bon.consistent_claims / (bon.consistent_claims + bon.inconsistent_claims + bon.unique_claims)) * 100).toFixed(1) + '%'
          : 'N/A'
      },

      benchmark_retrieval: {
        total_requests: br.total_requests,
        success_rate: br.total_requests > 0
          ? ((br.successful / br.total_requests) * 100).toFixed(1) + '%'
          : 'N/A',
        cache_hit_rate: br.total_requests > 0
          ? ((br.cached_hits / br.total_requests) * 100).toFixed(1) + '%'
          : 'N/A',
        top_categories: Object.entries(br.by_category)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([cat, count]) => `${cat}: ${count}`)
      },

      fabrication_detection: {
        total_checks: fd.total_checks,
        detection_rate: fd.total_checks > 0
          ? ((fd.fabrications_detected / fd.total_checks) * 100).toFixed(1) + '%'
          : 'N/A',
        by_type: fd.by_type
      },

      health_score: this.calculateHealthScore()
    };
  }

  /**
   * Calculate overall health score (0-100)
   */
  calculateHealthScore() {
    const cv = this.metrics.citation_verification;
    const bon = this.metrics.best_of_n;
    const br = this.metrics.benchmark_retrieval;
    const fd = this.metrics.fabrication_detection;

    let score = 100;
    let factors = 0;

    // Citation coverage (target: >80%)
    if (cv.total_checks > 0) {
      score -= Math.max(0, 80 - cv.average_coverage) * 0.5;
      factors++;
    }

    // Best-of-N consistency (target: >80%)
    if (bon.total_runs > 0) {
      score -= Math.max(0, 0.8 - bon.average_consistency) * 50;
      factors++;
    }

    // Benchmark success rate (target: >70%)
    if (br.total_requests > 0) {
      const successRate = br.successful / br.total_requests;
      score -= Math.max(0, 0.7 - successRate) * 30;
      factors++;
    }

    // Fabrication detection rate (target: <10%)
    if (fd.total_checks > 0) {
      const detectionRate = fd.fabrications_detected / fd.total_checks;
      score -= Math.max(0, detectionRate - 0.1) * 100;
      factors++;
    }

    return factors > 0 ? Math.max(0, Math.min(100, score)).toFixed(0) : 'N/A';
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      citation_verification: {
        total_checks: 0,
        total_claims: 0,
        verified_claims: 0,
        retracted_claims: 0,
        average_coverage: 0,
        checks_by_date: {}
      },
      best_of_n: {
        total_runs: 0,
        consistent_claims: 0,
        inconsistent_claims: 0,
        unique_claims: 0,
        average_consistency: 0,
        runs_by_date: {}
      },
      benchmark_retrieval: {
        total_requests: 0,
        successful: 0,
        failed: 0,
        cached_hits: 0,
        by_category: {},
        requests_by_date: {}
      },
      fabrication_detection: {
        total_checks: 0,
        fabrications_detected: 0,
        by_type: {
          salesforce_ids: 0,
          placeholder_names: 0,
          generic_records: 0,
          unmatched_values: 0
        },
        checks_by_date: {}
      },
      last_updated: null
    };
    this.saveMetrics();
  }
}

// Singleton instance
let monitorInstance = null;

function getMonitor() {
  if (!monitorInstance) {
    monitorInstance = new HallucinationMonitor();
  }
  return monitorInstance;
}

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  const monitor = getMonitor();

  if (args[0] === '--help' || args.length === 0) {
    console.log(`
Hallucination Prevention Monitor

Usage:
  hallucination-monitor.js summary [--days N]   Show metrics summary
  hallucination-monitor.js reset                Reset all metrics
  hallucination-monitor.js export [file]        Export metrics to JSON

Examples:
  hallucination-monitor.js summary --days 7
  hallucination-monitor.js export metrics-backup.json
    `);
    process.exit(0);
  }

  if (args[0] === 'summary') {
    const daysIdx = args.indexOf('--days');
    const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1], 10) : 30;
    console.log(JSON.stringify(monitor.getSummary(days), null, 2));
  }

  if (args[0] === 'reset') {
    monitor.reset();
    console.log('Metrics reset successfully');
  }

  if (args[0] === 'export') {
    const file = args[1] || 'hallucination-metrics-export.json';
    fs.writeFileSync(file, JSON.stringify(monitor.metrics, null, 2));
    console.log(`Metrics exported to ${file}`);
  }
}

module.exports = { HallucinationMonitor, getMonitor };
