#!/usr/bin/env node
/**
 * Routing Telemetry Dashboard - Observability for central services
 *
 * Analyzes routing decision logs and service telemetry to provide
 * insights into adoption rates, performance, and routing patterns.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { DataAccessError } = require('../../../cross-platform-plugin/scripts/lib/data-access-error');

const DECISION_LOG = path.join(__dirname, '../../logs/routing_decisions.jsonl');
const REPORT_SERVICE_LOG = path.join(__dirname, '../../logs/report-service.jsonl');
const MATCH_MERGE_LOG = path.join(__dirname, '../../logs/match-merge-service.jsonl');

class TelemetryDashboard {
  constructor() {
    this.decisions = this.loadLog(DECISION_LOG);
    this.reportService = this.loadLog(REPORT_SERVICE_LOG);
    this.matchMergeService = this.loadLog(MATCH_MERGE_LOG);
  }

  loadLog(logPath) {
    // File doesn't exist is expected (no telemetry yet)
    if (!fs.existsSync(logPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      return content.split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            // Individual line parse failure - skip line (expected for partial writes)
            return null;
          }
        })
        .filter(entry => entry !== null);
    } catch (error) {
      // Actual file read error (permissions, disk failure, etc.)
      throw new DataAccessError(
        'Telemetry_Dashboard',
        `Failed to load telemetry log from ${path.basename(logPath)}: ${error.message}`,
        {
          logPath,
          originalError: error.message,
          workaround: 'Check file permissions or delete corrupted log'
        }
      );
    }
  }

  async analyze() {
    console.log('=== Routing Telemetry Dashboard ===\n');

    this.showAdoptionMetrics();
    this.showRoutingDecisions();
    this.showServicePerformance();
    this.showConfidenceDistribution();
    this.showBypassReasons();
  }

  showAdoptionMetrics() {
    console.log('📈 Service Adoption Metrics\n');

    const totalDecisions = this.decisions.length;
    const serviceDecisions = this.decisions.filter(d => d.decision === 'service').length;
    const localDecisions = this.decisions.filter(d => d.decision === 'local').length;

    const adoptionRate = totalDecisions > 0 ? (serviceDecisions / totalDecisions) * 100 : 0;

    console.log(`  Total routing decisions: ${totalDecisions}`);
    console.log(`  Service routing: ${serviceDecisions} (${adoptionRate.toFixed(1)}%)`);
    console.log(`  Local routing: ${localDecisions} (${(100 - adoptionRate).toFixed(1)}%)`);

    // Report service usage
    const reportServiceCalls = this.reportService.length;
    const matchMergeCalls = this.matchMergeService.length;

    console.log(`\n  Report service calls: ${reportServiceCalls}`);
    console.log(`  Match/merge service calls: ${matchMergeCalls}`);

    console.log('');
  }

  showRoutingDecisions() {
    console.log('🔀 Routing Decision Breakdown\n');

    // Group by concern
    const byConcern = {};
    for (const decision of this.decisions) {
      if (!byConcern[decision.concern]) {
        byConcern[decision.concern] = { service: 0, local: 0 };
      }
      byConcern[decision.concern][decision.decision]++;
    }

    for (const [concern, counts] of Object.entries(byConcern)) {
      const total = counts.service + counts.local;
      const servicePercent = total > 0 ? (counts.service / total) * 100 : 0;
      console.log(`  ${concern}:`);
      console.log(`    Service: ${counts.service} (${servicePercent.toFixed(1)}%)`);
      console.log(`    Local: ${counts.local} (${(100 - servicePercent).toFixed(1)}%)`);
    }

    console.log('');
  }

  showServicePerformance() {
    console.log('⚡ Service Performance (SLA Compliance)\n');

    // Report service performance
    if (this.reportService.length > 0) {
      const latencies = this.reportService.map(entry => entry.latency_ms).filter(l => l);
      const p95 = this.percentile(latencies, 0.95);
      const p99 = this.percentile(latencies, 0.99);
      const successRate = this.reportService.filter(e => e.success).length / this.reportService.length;

      console.log('  Report Service:');
      console.log(`    p95 latency: ${p95 ? p95.toFixed(0) : 'N/A'} ms (SLA: 2500 ms) ${p95 && p95 < 2500 ? '✅' : '❌'}`);
      console.log(`    p99 latency: ${p99 ? p99.toFixed(0) : 'N/A'} ms (SLA: 5000 ms) ${p99 && p99 < 5000 ? '✅' : '❌'}`);
      console.log(`    Success rate: ${(successRate * 100).toFixed(1)}% (SLA: 98%) ${successRate >= 0.98 ? '✅' : '❌'}`);
      console.log(`    Total calls: ${this.reportService.length}`);
    } else {
      console.log('  Report Service: No data');
    }

    // Match/merge service performance
    if (this.matchMergeService.length > 0) {
      const latencies = this.matchMergeService.map(entry => entry.latency_ms).filter(l => l);
      const p95 = this.percentile(latencies, 0.95);
      const p99 = this.percentile(latencies, 0.99);
      const successRate = this.matchMergeService.filter(e => e.success).length / this.matchMergeService.length;

      console.log('\n  Match/Merge Service:');
      console.log(`    p95 latency: ${p95 ? p95.toFixed(0) : 'N/A'} ms (SLA: 5000 ms) ${p95 && p95 < 5000 ? '✅' : '❌'}`);
      console.log(`    p99 latency: ${p99 ? p99.toFixed(0) : 'N/A'} ms (SLA: 10000 ms) ${p99 && p99 < 10000 ? '✅' : '❌'}`);
      console.log(`    Success rate: ${(successRate * 100).toFixed(1)}% (SLA: 99%) ${successRate >= 0.99 ? '✅' : '❌'}`);
      console.log(`    Total calls: ${this.matchMergeService.length}`);
    } else {
      console.log('\n  Match/Merge Service: No data');
    }

    console.log('');
  }

  showConfidenceDistribution() {
    console.log('📊 Routing Confidence Distribution\n');

    const confidences = this.decisions.map(d => d.routing_confidence).filter(c => c !== undefined);

    if (confidences.length === 0) {
      console.log('  No confidence data available\n');
      return;
    }

    const bins = {
      '0.0-0.25': 0,
      '0.25-0.50': 0,
      '0.50-0.75': 0,
      '0.75-0.90': 0,
      '0.90-1.00': 0
    };

    for (const conf of confidences) {
      if (conf < 0.25) bins['0.0-0.25']++;
      else if (conf < 0.50) bins['0.25-0.50']++;
      else if (conf < 0.75) bins['0.50-0.75']++;
      else if (conf < 0.90) bins['0.75-0.90']++;
      else bins['0.90-1.00']++;
    }

    for (const [range, count] of Object.entries(bins)) {
      const percent = (count / confidences.length) * 100;
      const bar = '█'.repeat(Math.floor(percent / 2));
      console.log(`  ${range}: ${bar} ${count} (${percent.toFixed(1)}%)`);
    }

    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    console.log(`\n  Average confidence: ${avgConfidence.toFixed(2)}`);
    console.log('');
  }

  showBypassReasons() {
    console.log('📋 Local Execution Bypass Reasons\n');

    const localDecisions = this.decisions.filter(d => d.decision === 'local');

    if (localDecisions.length === 0) {
      console.log('  No local executions (100% service adoption)\n');
      return;
    }

    const reasons = {};
    for (const decision of localDecisions) {
      const reason = decision.why || 'unknown';
      reasons[reason] = (reasons[reason] || 0) + 1;
    }

    const sorted = Object.entries(reasons).sort((a, b) => b[1] - a[1]);

    for (const [reason, count] of sorted) {
      const percent = (count / localDecisions.length) * 100;
      console.log(`  ${count} (${percent.toFixed(1)}%): ${reason}`);
    }

    console.log('');
  }

  percentile(arr, p) {
    if (arr.length === 0) return null;
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }

  generateSummary() {
    const totalCalls = this.reportService.length + this.matchMergeService.length;
    const totalDecisions = this.decisions.length;
    const serviceRouting = this.decisions.filter(d => d.decision === 'service').length;

    return {
      total_routing_decisions: totalDecisions,
      service_adoption_rate: totalDecisions > 0 ? (serviceRouting / totalDecisions) : 0,
      total_service_calls: totalCalls,
      report_service_calls: this.reportService.length,
      match_merge_calls: this.matchMergeService.length,
      sla_compliance: {
        report_service: this.checkSLA(this.reportService, 2500, 0.98),
        match_merge: this.checkSLA(this.matchMergeService, 5000, 0.99)
      }
    };
  }

  checkSLA(log, p95Target, successRateTarget) {
    if (log.length === 0) return { compliant: null, reason: 'no_data' };

    const latencies = log.map(entry => entry.latency_ms).filter(l => l);
    const p95 = this.percentile(latencies, 0.95);
    const successRate = log.filter(e => e.success).length / log.length;

    const latencyOK = p95 ? p95 < p95Target : false;
    const successRateOK = successRate >= successRateTarget;

    return {
      compliant: latencyOK && successRateOK,
      p95_latency_ms: p95,
      p95_target_ms: p95Target,
      success_rate: successRate,
      success_rate_target: successRateTarget
    };
  }
}

// CLI execution
if (require.main === module) {
  const dashboard = new TelemetryDashboard();
  dashboard.analyze().then(() => {
    const summary = dashboard.generateSummary();
    console.log('📄 Summary JSON:\n');
    console.log(JSON.stringify(summary, null, 2));
  });
}

module.exports = TelemetryDashboard;
