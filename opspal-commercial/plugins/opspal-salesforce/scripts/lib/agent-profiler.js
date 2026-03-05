#!/usr/bin/env node

/**
 * Agent Performance Profiler - Deep performance analysis and optimization
 *
 * Purpose: Profile agent performance, detect bottlenecks, provide optimization recommendations
 * Coverage:
 * - Detailed execution profiling (wall time, CPU time, memory)
 * - Bottleneck detection (slow operations, high memory usage)
 * - Resource usage tracking (per-agent metrics)
 * - Comparative analysis (agent-to-agent comparison)
 * - Optimization recommendations (actionable insights)
 * - Performance regression detection
 *
 * Usage:
 *   const AgentProfiler = require('./agent-profiler');
 *   const profiler = new AgentProfiler();
 *
 *   // Start profiling
 *   const session = profiler.startProfiling('my-agent');
 *   // ... agent execution ...
 *   profiler.endProfiling(session);
 *
 *   // Generate report
 *   const report = profiler.generateReport('my-agent');
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const v8 = require('v8');

class AgentProfiler {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(__dirname, '../../.profiler');
    this.retentionDays = options.retentionDays || 30;

    // Active profiling sessions
    this.activeSessions = new Map();

    // Performance data buffer
    this.performanceData = [];

    // Ensure storage directory exists
    this._ensureStorageDir();
  }

  // ═══════════════════════════════════════════════════════════════
  // PROFILING SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Start profiling session for an agent
   *
   * @param {string} agentName - Agent name
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Session object
   */
  startProfiling(agentName, metadata = {}) {
    const sessionId = `${agentName}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Capture initial state
    const initialMemory = process.memoryUsage();
    const initialCpu = process.cpuUsage();
    const initialHeap = v8.getHeapStatistics();

    const session = {
      id: sessionId,
      agentName: agentName,
      startTime: Date.now(),
      startHrTime: process.hrtime.bigint(),
      initialMemory: initialMemory,
      initialCpu: initialCpu,
      initialHeap: initialHeap,
      metadata: metadata,
      checkpoints: [],
      operations: []
    };

    this.activeSessions.set(sessionId, session);

    return session;
  }

  /**
   * Add checkpoint to profiling session
   *
   * @param {Object} session - Session object
   * @param {string} label - Checkpoint label
   * @param {Object} data - Checkpoint data
   */
  checkpoint(session, label, data = {}) {
    if (!this.activeSessions.has(session.id)) {
      throw new Error(`Session ${session.id} not found`);
    }

    const now = Date.now();
    const hrNow = process.hrtime.bigint();
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();

    const checkpoint = {
      label: label,
      timestamp: now,
      elapsedMs: now - session.startTime,
      elapsedNs: Number(hrNow - session.startHrTime),
      memory: memory,
      cpu: cpu,
      data: data
    };

    session.checkpoints.push(checkpoint);
  }

  /**
   * Record operation within profiling session
   *
   * @param {Object} session - Session object
   * @param {string} operationName - Operation name
   * @param {number} duration - Duration in ms
   * @param {Object} metadata - Operation metadata
   */
  recordOperation(session, operationName, duration, metadata = {}) {
    if (!this.activeSessions.has(session.id)) {
      throw new Error(`Session ${session.id} not found`);
    }

    const operation = {
      name: operationName,
      duration: duration,
      timestamp: Date.now(),
      metadata: metadata
    };

    session.operations.push(operation);
  }

  /**
   * End profiling session
   *
   * @param {Object} session - Session object
   * @returns {Object} Performance profile
   */
  endProfiling(session) {
    if (!this.activeSessions.has(session.id)) {
      throw new Error(`Session ${session.id} not found`);
    }

    const endTime = Date.now();
    const endHrTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    const endCpu = process.cpuUsage();
    const endHeap = v8.getHeapStatistics();

    // Calculate totals
    const totalDuration = endTime - session.startTime;
    const totalDurationNs = Number(endHrTime - session.startHrTime);

    const memoryDelta = {
      rss: endMemory.rss - session.initialMemory.rss,
      heapTotal: endMemory.heapTotal - session.initialMemory.heapTotal,
      heapUsed: endMemory.heapUsed - session.initialMemory.heapUsed,
      external: endMemory.external - session.initialMemory.external
    };

    const cpuDelta = {
      user: endCpu.user - session.initialCpu.user,
      system: endCpu.system - session.initialCpu.system
    };

    // Build performance profile
    const profile = {
      sessionId: session.id,
      agentName: session.agentName,
      startTime: session.startTime,
      endTime: endTime,
      duration: {
        total: totalDuration,
        totalNs: totalDurationNs,
        userCpu: cpuDelta.user,
        systemCpu: cpuDelta.system,
        wallTime: totalDuration
      },
      memory: {
        initial: session.initialMemory,
        final: endMemory,
        delta: memoryDelta,
        peak: this._calculatePeakMemory(session)
      },
      heap: {
        initial: session.initialHeap,
        final: endHeap,
        delta: {
          totalHeapSize: endHeap.total_heap_size - session.initialHeap.total_heap_size,
          usedHeapSize: endHeap.used_heap_size - session.initialHeap.used_heap_size,
          heapSizeLimit: endHeap.heap_size_limit - session.initialHeap.heap_size_limit
        }
      },
      checkpoints: session.checkpoints,
      operations: session.operations,
      metadata: session.metadata,
      analysis: this._analyzeProfile(session, totalDuration, memoryDelta, cpuDelta)
    };

    // Store performance data
    this.performanceData.push(profile);
    this._persistProfile(profile);

    // Remove from active sessions
    this.activeSessions.delete(session.id);

    return profile;
  }

  // ═══════════════════════════════════════════════════════════════
  // ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Analyze performance profile for bottlenecks and issues
   *
   * @param {Object} session - Session object
   * @param {number} totalDuration - Total duration
   * @param {Object} memoryDelta - Memory delta
   * @param {Object} cpuDelta - CPU delta
   * @returns {Object} Analysis results
   */
  _analyzeProfile(session, totalDuration, memoryDelta, cpuDelta) {
    const analysis = {
      bottlenecks: [],
      memoryIssues: [],
      performanceScore: 100,
      recommendations: []
    };

    // Analyze checkpoints for bottlenecks
    if (session.checkpoints.length > 1) {
      for (let i = 1; i < session.checkpoints.length; i++) {
        const prev = session.checkpoints[i - 1];
        const curr = session.checkpoints[i];
        const segmentDuration = curr.elapsedMs - prev.elapsedMs;
        const percentOfTotal = (segmentDuration / totalDuration) * 100;

        // Bottleneck: segment takes >30% of total time
        if (percentOfTotal > 30) {
          analysis.bottlenecks.push({
            type: 'slow_segment',
            label: `${prev.label} → ${curr.label}`,
            duration: segmentDuration,
            percentOfTotal: percentOfTotal,
            severity: percentOfTotal > 50 ? 'critical' : 'warning'
          });
          analysis.performanceScore -= percentOfTotal > 50 ? 20 : 10;
        }
      }
    }

    // Analyze operations
    if (session.operations.length > 0) {
      const sortedOps = session.operations.slice().sort((a, b) => b.duration - a.duration);
      const slowestOp = sortedOps[0];
      const percentOfTotal = (slowestOp.duration / totalDuration) * 100;

      if (percentOfTotal > 20) {
        analysis.bottlenecks.push({
          type: 'slow_operation',
          operation: slowestOp.name,
          duration: slowestOp.duration,
          percentOfTotal: percentOfTotal,
          severity: percentOfTotal > 40 ? 'critical' : 'warning'
        });
        analysis.performanceScore -= percentOfTotal > 40 ? 15 : 8;
      }
    }

    // Analyze memory usage
    const heapGrowth = memoryDelta.heapUsed;
    const heapGrowthMB = heapGrowth / 1024 / 1024;

    if (heapGrowthMB > 100) {
      analysis.memoryIssues.push({
        type: 'high_memory_growth',
        growth: heapGrowthMB,
        severity: heapGrowthMB > 500 ? 'critical' : 'warning'
      });
      analysis.performanceScore -= heapGrowthMB > 500 ? 20 : 10;
    }

    if (memoryDelta.heapUsed < 0) {
      // Memory leak potential (heap not released)
      const checkpointMemoryTrend = this._analyzeMemoryTrend(session.checkpoints);
      if (checkpointMemoryTrend === 'increasing') {
        analysis.memoryIssues.push({
          type: 'potential_memory_leak',
          severity: 'warning'
        });
        analysis.performanceScore -= 15;
      }
    }

    // Generate recommendations
    analysis.recommendations = this._generateRecommendations(analysis, session, totalDuration, memoryDelta, cpuDelta);

    // Ensure score is 0-100
    analysis.performanceScore = Math.max(0, Math.min(100, analysis.performanceScore));

    return analysis;
  }

  /**
   * Generate optimization recommendations
   *
   * @param {Object} analysis - Analysis results
   * @param {Object} session - Session object
   * @param {number} totalDuration - Total duration
   * @param {Object} memoryDelta - Memory delta
   * @param {Object} cpuDelta - CPU delta
   * @returns {Array} Recommendations
   */
  _generateRecommendations(analysis, session, totalDuration, memoryDelta, cpuDelta) {
    const recommendations = [];

    // Slow segment recommendations
    const slowSegments = analysis.bottlenecks.filter(b => b.type === 'slow_segment');
    if (slowSegments.length > 0) {
      const slowest = slowSegments[0];
      recommendations.push({
        type: 'performance',
        priority: slowest.severity === 'critical' ? 'high' : 'medium',
        title: `Optimize ${slowest.label}`,
        description: `This segment takes ${slowest.percentOfTotal.toFixed(1)}% of total execution time (${slowest.duration}ms)`,
        suggestions: [
          'Profile this segment in detail to identify specific bottleneck',
          'Consider caching if this involves repeated computations',
          'Check for synchronous I/O operations that could be parallelized',
          'Review database queries for optimization opportunities'
        ]
      });
    }

    // Slow operation recommendations
    const slowOps = analysis.bottlenecks.filter(b => b.type === 'slow_operation');
    if (slowOps.length > 0) {
      const slowest = slowOps[0];
      recommendations.push({
        type: 'performance',
        priority: slowest.severity === 'critical' ? 'high' : 'medium',
        title: `Optimize operation: ${slowest.operation}`,
        description: `This operation takes ${slowest.percentOfTotal.toFixed(1)}% of total time (${slowest.duration}ms)`,
        suggestions: [
          'Break down into smaller operations for better parallelization',
          'Implement caching if results can be reused',
          'Consider batch processing for multiple items',
          'Review for unnecessary data processing'
        ]
      });
    }

    // Memory recommendations
    const memoryIssues = analysis.memoryIssues;
    if (memoryIssues.length > 0) {
      for (const issue of memoryIssues) {
        if (issue.type === 'high_memory_growth') {
          recommendations.push({
            type: 'memory',
            priority: issue.severity === 'critical' ? 'high' : 'medium',
            title: 'High memory growth detected',
            description: `Heap memory increased by ${issue.growth.toFixed(1)}MB during execution`,
            suggestions: [
              'Process data in smaller chunks instead of loading all at once',
              'Clear large data structures when no longer needed',
              'Use streams for large file processing',
              'Consider implementing pagination for large datasets'
            ]
          });
        } else if (issue.type === 'potential_memory_leak') {
          recommendations.push({
            type: 'memory',
            priority: 'high',
            title: 'Potential memory leak detected',
            description: 'Memory usage increases steadily without being released',
            suggestions: [
              'Review for circular references that prevent garbage collection',
              'Ensure event listeners are properly removed',
              'Check for timers/intervals that are not cleared',
              'Use weak references where appropriate'
            ]
          });
        }
      }
    }

    // CPU utilization recommendations
    const cpuUsageMs = cpuDelta.user + cpuDelta.system;
    const cpuUtilization = cpuUsageMs / (totalDuration * 1000); // Convert to microseconds

    if (cpuUtilization < 0.3 && totalDuration > 1000) {
      // Low CPU utilization suggests I/O bound
      recommendations.push({
        type: 'performance',
        priority: 'low',
        title: 'Low CPU utilization detected',
        description: `CPU utilization is ${(cpuUtilization * 100).toFixed(1)}%, suggesting I/O-bound operations`,
        suggestions: [
          'Consider parallelizing I/O operations',
          'Implement connection pooling for database/API calls',
          'Use async/await properly to avoid blocking',
          'Batch multiple I/O operations together'
        ]
      });
    } else if (cpuUtilization > 0.9 && totalDuration > 1000) {
      // High CPU utilization suggests CPU bound
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'High CPU utilization detected',
        description: `CPU utilization is ${(cpuUtilization * 100).toFixed(1)}%, suggesting CPU-bound operations`,
        suggestions: [
          'Optimize algorithms for better time complexity',
          'Consider caching expensive computations',
          'Use worker threads for CPU-intensive tasks',
          'Profile hot code paths for micro-optimizations'
        ]
      });
    }

    // General performance recommendations
    if (totalDuration > 10000) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'Long execution time',
        description: `Total execution time is ${(totalDuration / 1000).toFixed(1)}s`,
        suggestions: [
          'Break down into smaller, parallelizable tasks',
          'Implement progress checkpoints for resumability',
          'Consider background processing for non-critical operations',
          'Review for unnecessary sequential operations'
        ]
      });
    }

    return recommendations;
  }

  /**
   * Calculate peak memory usage from checkpoints
   *
   * @param {Object} session - Session object
   * @returns {number} Peak heap usage
   */
  _calculatePeakMemory(session) {
    if (session.checkpoints.length === 0) {
      return session.initialMemory.heapUsed;
    }

    const peak = session.checkpoints.reduce((max, checkpoint) => {
      return Math.max(max, checkpoint.memory.heapUsed);
    }, session.initialMemory.heapUsed);

    return peak;
  }

  /**
   * Analyze memory trend from checkpoints
   *
   * @param {Array} checkpoints - Checkpoints array
   * @returns {string} Trend (increasing, decreasing, stable)
   */
  _analyzeMemoryTrend(checkpoints) {
    if (checkpoints.length < 3) {
      return 'unknown';
    }

    let increases = 0;
    let decreases = 0;

    for (let i = 1; i < checkpoints.length; i++) {
      const prev = checkpoints[i - 1].memory.heapUsed;
      const curr = checkpoints[i].memory.heapUsed;

      if (curr > prev * 1.1) { // 10% increase
        increases++;
      } else if (curr < prev * 0.9) { // 10% decrease
        decreases++;
      }
    }

    if (increases > decreases * 2) {
      return 'increasing';
    } else if (decreases > increases * 2) {
      return 'decreasing';
    } else {
      return 'stable';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REPORTING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate performance report for an agent
   *
   * @param {string} agentName - Agent name
   * @param {Object} options - Report options
   * @returns {Object} Performance report
   */
  generateReport(agentName, options = {}) {
    const timeRange = options.timeRange || '24h';
    const profiles = this._loadProfiles(agentName, timeRange);

    if (profiles.length === 0) {
      return {
        agentName: agentName,
        timeRange: timeRange,
        profileCount: 0,
        message: 'No profiling data available'
      };
    }

    // Aggregate statistics
    const stats = this._aggregateStats(profiles);

    // Detect regressions
    const regressions = this._detectRegressions(profiles);

    // Comparative analysis
    const comparative = options.compareWith ?
      this._compareAgents(agentName, options.compareWith, timeRange) : null;

    return {
      agentName: agentName,
      timeRange: timeRange,
      profileCount: profiles.length,
      statistics: stats,
      regressions: regressions,
      comparative: comparative,
      topBottlenecks: this._getTopBottlenecks(profiles, 5),
      topRecommendations: this._getTopRecommendations(profiles, 5)
    };
  }

  /**
   * Aggregate statistics from profiles
   *
   * @param {Array} profiles - Array of profiles
   * @returns {Object} Aggregated statistics
   */
  _aggregateStats(profiles) {
    const durations = profiles.map(p => p.duration.total);
    const memoryDeltas = profiles.map(p => p.memory.delta.heapUsed);
    const scores = profiles.map(p => p.analysis.performanceScore);

    return {
      executions: profiles.length,
      duration: {
        avg: this._average(durations),
        min: Math.min(...durations),
        max: Math.max(...durations),
        p50: this._percentile(durations, 50),
        p95: this._percentile(durations, 95),
        p99: this._percentile(durations, 99)
      },
      memory: {
        avgDelta: this._average(memoryDeltas),
        maxDelta: Math.max(...memoryDeltas),
        minDelta: Math.min(...memoryDeltas)
      },
      performance: {
        avgScore: this._average(scores),
        minScore: Math.min(...scores),
        maxScore: Math.max(...scores)
      },
      bottleneckFrequency: this._countBottleneckTypes(profiles),
      memoryIssueFrequency: this._countMemoryIssueTypes(profiles)
    };
  }

  /**
   * Detect performance regressions
   *
   * @param {Array} profiles - Array of profiles (sorted by time)
   * @returns {Array} Detected regressions
   */
  _detectRegressions(profiles) {
    if (profiles.length < 10) {
      return [];
    }

    const regressions = [];
    const sortedProfiles = profiles.slice().sort((a, b) => a.startTime - b.startTime);

    // Split into baseline (first 50%) and recent (last 50%)
    const midpoint = Math.floor(sortedProfiles.length / 2);
    const baseline = sortedProfiles.slice(0, midpoint);
    const recent = sortedProfiles.slice(midpoint);

    const baselineAvgDuration = this._average(baseline.map(p => p.duration.total));
    const recentAvgDuration = this._average(recent.map(p => p.duration.total));

    // Duration regression (>20% slower)
    const durationIncrease = (recentAvgDuration - baselineAvgDuration) / baselineAvgDuration;
    if (durationIncrease > 0.20) {
      regressions.push({
        type: 'duration_regression',
        severity: durationIncrease > 0.50 ? 'critical' : 'warning',
        baseline: baselineAvgDuration,
        current: recentAvgDuration,
        change: durationIncrease,
        message: `Execution time increased by ${(durationIncrease * 100).toFixed(1)}%`
      });
    }

    // Memory regression (>50% more memory)
    const baselineAvgMemory = this._average(baseline.map(p => p.memory.delta.heapUsed));
    const recentAvgMemory = this._average(recent.map(p => p.memory.delta.heapUsed));
    const memoryIncrease = (recentAvgMemory - baselineAvgMemory) / Math.abs(baselineAvgMemory);

    if (memoryIncrease > 0.50) {
      regressions.push({
        type: 'memory_regression',
        severity: memoryIncrease > 1.0 ? 'critical' : 'warning',
        baseline: baselineAvgMemory,
        current: recentAvgMemory,
        change: memoryIncrease,
        message: `Memory usage increased by ${(memoryIncrease * 100).toFixed(1)}%`
      });
    }

    // Performance score regression (>15 point drop)
    const baselineAvgScore = this._average(baseline.map(p => p.analysis.performanceScore));
    const recentAvgScore = this._average(recent.map(p => p.analysis.performanceScore));
    const scoreDrop = baselineAvgScore - recentAvgScore;

    if (scoreDrop > 15) {
      regressions.push({
        type: 'score_regression',
        severity: scoreDrop > 30 ? 'critical' : 'warning',
        baseline: baselineAvgScore,
        current: recentAvgScore,
        change: -scoreDrop,
        message: `Performance score dropped by ${scoreDrop.toFixed(1)} points`
      });
    }

    return regressions;
  }

  /**
   * Compare two agents' performance
   *
   * @param {string} agentA - First agent name
   * @param {string} agentB - Second agent name
   * @param {string} timeRange - Time range
   * @returns {Object} Comparative analysis
   */
  _compareAgents(agentA, agentB, timeRange) {
    const profilesA = this._loadProfiles(agentA, timeRange);
    const profilesB = this._loadProfiles(agentB, timeRange);

    if (profilesA.length === 0 || profilesB.length === 0) {
      return null;
    }

    const statsA = this._aggregateStats(profilesA);
    const statsB = this._aggregateStats(profilesB);

    return {
      agentA: { name: agentA, stats: statsA },
      agentB: { name: agentB, stats: statsB },
      comparison: {
        durationRatio: statsA.duration.avg / statsB.duration.avg,
        memoryRatio: statsA.memory.avgDelta / statsB.memory.avgDelta,
        scoreRatio: statsA.performance.avgScore / statsB.performance.avgScore
      }
    };
  }

  /**
   * Get top bottlenecks across profiles
   *
   * @param {Array} profiles - Array of profiles
   * @param {number} limit - Number of results
   * @returns {Array} Top bottlenecks
   */
  _getTopBottlenecks(profiles, limit = 5) {
    const bottleneckCounts = {};

    for (const profile of profiles) {
      for (const bottleneck of profile.analysis.bottlenecks) {
        const key = `${bottleneck.type}:${bottleneck.label || bottleneck.operation}`;

        if (!bottleneckCounts[key]) {
          bottleneckCounts[key] = {
            type: bottleneck.type,
            label: bottleneck.label || bottleneck.operation,
            count: 0,
            totalDuration: 0,
            avgDuration: 0,
            severity: bottleneck.severity
          };
        }

        bottleneckCounts[key].count++;
        bottleneckCounts[key].totalDuration += bottleneck.duration;
      }
    }

    // Calculate averages and sort
    const bottlenecks = Object.values(bottleneckCounts);
    for (const b of bottlenecks) {
      b.avgDuration = b.totalDuration / b.count;
    }

    bottlenecks.sort((a, b) => b.count - a.count);

    return bottlenecks.slice(0, limit);
  }

  /**
   * Get top recommendations across profiles
   *
   * @param {Array} profiles - Array of profiles
   * @param {number} limit - Number of results
   * @returns {Array} Top recommendations
   */
  _getTopRecommendations(profiles, limit = 5) {
    const recommendationCounts = {};

    for (const profile of profiles) {
      for (const rec of profile.analysis.recommendations) {
        const key = rec.title;

        if (!recommendationCounts[key]) {
          recommendationCounts[key] = {
            ...rec,
            count: 0
          };
        }

        recommendationCounts[key].count++;
      }
    }

    const recommendations = Object.values(recommendationCounts);
    recommendations.sort((a, b) => b.count - a.count);

    return recommendations.slice(0, limit);
  }

  // ═══════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Persist profile to disk
   *
   * @param {Object} profile - Performance profile
   */
  _persistProfile(profile) {
    // Ensure storage directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    const date = new Date(profile.startTime).toISOString().split('T')[0];
    const filename = `profiles-${profile.agentName}-${date}.jsonl`;
    const filepath = path.join(this.storageDir, filename);

    fs.appendFileSync(filepath, JSON.stringify(profile) + '\n');
  }

  /**
   * Load profiles for agent
   *
   * @param {string} agentName - Agent name
   * @param {string} timeRange - Time range
   * @returns {Array} Array of profiles
   */
  _loadProfiles(agentName, timeRange) {
    const startTime = Date.now() - this._parseTimeRange(timeRange);
    const profiles = [];

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date(startTime);

    const dates = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    // Load each day's profiles
    for (const date of dates) {
      const filename = `profiles-${agentName}-${date}.jsonl`;
      const filepath = path.join(this.storageDir, filename);

      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf8');
        const lines = content.trim().split('\n');

        for (const line of lines) {
          if (!line) continue;

          try {
            const profile = JSON.parse(line);
            if (profile.startTime >= startTime) {
              profiles.push(profile);
            }
          } catch (e) {
            // Skip malformed lines
          }
        }
      }
    }

    return profiles;
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════

  _ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  _parseTimeRange(range) {
    const units = {
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    const match = range.match(/^(\d+)([mhd])$/);
    if (!match) {
      throw new Error(`Invalid time range: ${range}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    return value * units[unit];
  }

  _average(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  _percentile(arr, p) {
    if (arr.length === 0) return 0;

    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;

    return sorted[Math.max(0, index)];
  }

  _countBottleneckTypes(profiles) {
    const counts = {};

    for (const profile of profiles) {
      for (const bottleneck of profile.analysis.bottlenecks) {
        counts[bottleneck.type] = (counts[bottleneck.type] || 0) + 1;
      }
    }

    return counts;
  }

  _countMemoryIssueTypes(profiles) {
    const counts = {};

    for (const profile of profiles) {
      for (const issue of profile.analysis.memoryIssues) {
        counts[issue.type] = (counts[issue.type] || 0) + 1;
      }
    }

    return counts;
  }

  /**
   * List all agents with profile data
   *
   * @param {string} timeRange - Time range to query (1h, 24h, 7d, 30d)
   * @returns {Array} Array of agents with summary stats
   */
  listAgents(timeRange = '24h') {
    const agentDirs = this._getAgentDirectories();
    const agents = [];

    for (const agentName of agentDirs) {
      const profiles = this._loadProfiles(agentName, timeRange);

      if (profiles.length === 0) continue;

      const stats = this._aggregateStats(profiles);

      agents.push({
        name: agentName,
        executionCount: profiles.length,
        avgDuration: stats.duration.avg,
        avgMemoryDelta: stats.memory.avgDelta,
        avgScore: stats.performance.avgScore
      });
    }

    return agents;
  }

  /**
   * Analyze performance trends over multiple time ranges
   *
   * @param {string} agentName - Agent to analyze
   * @returns {Object} Trend analysis
   */
  analyzeTrends(agentName) {
    const lastHour = this._loadProfiles(agentName, '1h');
    const last24h = this._loadProfiles(agentName, '24h');
    const last7d = this._loadProfiles(agentName, '7d');

    const hourStats = lastHour.length > 0 ? this._aggregateStats(lastHour) : null;
    const dayStats = last24h.length > 0 ? this._aggregateStats(last24h) : null;
    const weekStats = last7d.length > 0 ? this._aggregateStats(last7d) : null;

    return {
      duration: {
        lastHour: hourStats ? {
          avg: hourStats.duration.avg,
          p95: hourStats.duration.p95
        } : null,
        last24h: dayStats ? {
          avg: dayStats.duration.avg,
          p95: dayStats.duration.p95
        } : null,
        last7d: weekStats ? {
          avg: weekStats.duration.avg,
          p95: weekStats.duration.p95
        } : null
      },
      memory: {
        lastHour: hourStats ? {
          avgDelta: hourStats.memory.avgDelta
        } : null,
        last24h: dayStats ? {
          avgDelta: dayStats.memory.avgDelta
        } : null,
        last7d: weekStats ? {
          avgDelta: weekStats.memory.avgDelta
        } : null
      }
    };
  }

  /**
   * Get list of agents with profile data
   *
   * @returns {Array} Agent names
   */
  _getAgentDirectories() {
    if (!fs.existsSync(this.storageDir)) {
      return [];
    }

    // Extract unique agent names from profile files
    const files = fs.readdirSync(this.storageDir)
      .filter(name => name.startsWith('profiles-') && name.endsWith('.jsonl'));

    const agents = new Set();
    for (const file of files) {
      // Extract agent name from filename: profiles-{agentName}-{date}.jsonl
      const match = file.match(/^profiles-(.+?)-\d{4}-\d{2}-\d{2}\.jsonl$/);
      if (match) {
        agents.add(match[1]);
      }
    }

    return Array.from(agents);
  }
}

// Export singleton instance
let instance = null;

function getInstance(options) {
  if (!instance) {
    instance = new AgentProfiler(options);
  }
  return instance;
}

module.exports = AgentProfiler;
module.exports.getInstance = getInstance;
module.exports.AgentProfiler = AgentProfiler;
