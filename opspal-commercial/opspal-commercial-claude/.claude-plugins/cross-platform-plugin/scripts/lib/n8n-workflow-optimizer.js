#!/usr/bin/env node
/**
 * n8n Workflow Optimizer
 *
 * Analyzes workflow executions and generates optimization recommendations.
 * Identifies bottlenecks, error patterns, and performance improvements.
 *
 * @version 1.0.0
 * @requires N8N_API_KEY environment variable
 * @requires N8N_BASE_URL environment variable
 *
 * Usage:
 *   node n8n-workflow-optimizer.js analyze <workflow-id>        # Full analysis
 *   node n8n-workflow-optimizer.js bottlenecks <workflow-id>    # Identify bottlenecks
 *   node n8n-workflow-optimizer.js errors <workflow-id>         # Error pattern analysis
 *   node n8n-workflow-optimizer.js recommendations <workflow-id> # Get recommendations
 *   node n8n-workflow-optimizer.js score <workflow-id>          # Efficiency score
 *   node n8n-workflow-optimizer.js compare <id1> <id2>          # Compare workflows
 */

const fs = require('fs');
const path = require('path');

// Configuration
const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://your-instance.n8n.cloud';

/**
 * Make authenticated API request to n8n
 */
async function n8nRequest(endpoint, method = 'GET', body = null) {
  if (!N8N_API_KEY) {
    throw new Error('N8N_API_KEY environment variable is required');
  }

  const url = `${N8N_BASE_URL}/api/v1${endpoint}`;
  const options = {
    method,
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`n8n API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Get workflow execution history
 * @param {string} workflowId - Workflow ID
 * @param {number} limit - Number of executions to fetch
 * @returns {Promise<array>} Execution history
 */
async function getExecutions(workflowId, limit = 100) {
  const executions = await n8nRequest(
    `/executions?workflowId=${workflowId}&limit=${limit}`
  );
  return executions;
}

/**
 * Calculate execution duration statistics
 * @param {array} executions - Execution history
 * @returns {object} Duration statistics
 */
function calculateDurationStats(executions) {
  const successful = executions.filter(e => e.finished && !e.stoppedAt);
  const durations = successful
    .map(e => {
      const start = new Date(e.startedAt).getTime();
      const end = new Date(e.stoppedAt || e.finishedAt).getTime();
      return end - start;
    })
    .filter(d => d > 0);

  if (durations.length === 0) {
    return { avg: 0, min: 0, max: 0, p50: 0, p95: 0 };
  }

  const sorted = durations.sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    avg: Math.round(sum / sorted.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    sampleSize: sorted.length
  };
}

/**
 * Identify slowest nodes (bottlenecks)
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<array>} Bottleneck analysis
 */
async function identifyBottlenecks(workflowId) {
  const workflow = await n8nRequest(`/workflows/${workflowId}`);
  const executions = await getExecutions(workflowId, 50);

  // Get detailed execution data for node-level timing
  const nodeTimings = {};

  for (const exec of executions.filter(e => e.finished)) {
    try {
      const detail = await n8nRequest(`/executions/${exec.id}`);

      if (detail.data?.resultData?.runData) {
        for (const [nodeName, runs] of Object.entries(detail.data.resultData.runData)) {
          if (!nodeTimings[nodeName]) {
            nodeTimings[nodeName] = [];
          }

          for (const run of runs) {
            if (run.startTime && run.executionTime) {
              nodeTimings[nodeName].push(run.executionTime);
            }
          }
        }
      }
    } catch (e) {
      // Skip executions we can't access
    }
  }

  // Calculate statistics for each node
  const bottlenecks = Object.entries(nodeTimings)
    .map(([nodeName, timings]) => {
      if (timings.length === 0) return null;

      const sorted = timings.sort((a, b) => a - b);
      const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

      // Find the node type
      const node = workflow.nodes?.find(n => n.name === nodeName);

      return {
        nodeName,
        nodeType: node?.type?.replace('n8n-nodes-base.', '') || 'unknown',
        avgDuration: Math.round(avg),
        maxDuration: sorted[sorted.length - 1],
        samples: timings.length
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.avgDuration - a.avgDuration);

  return {
    workflowId,
    totalNodes: workflow.nodes?.length || 0,
    bottlenecks: bottlenecks.slice(0, 10), // Top 10 slowest
    summary: bottlenecks.length > 0
      ? `Slowest node: ${bottlenecks[0].nodeName} (avg ${bottlenecks[0].avgDuration}ms)`
      : 'No timing data available'
  };
}

/**
 * Analyze error patterns
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<object>} Error analysis
 */
async function analyzeErrors(workflowId) {
  const executions = await getExecutions(workflowId, 100);

  const total = executions.length;
  const failed = executions.filter(e => e.status === 'error' || e.stoppedAt);
  const errorRate = total > 0 ? (failed.length / total * 100).toFixed(1) : 0;

  // Categorize errors
  const errorCategories = {
    AUTH: [],
    RATE_LIMIT: [],
    TIMEOUT: [],
    VALIDATION: [],
    SERVER: [],
    UNKNOWN: []
  };

  for (const exec of failed) {
    try {
      const detail = await n8nRequest(`/executions/${exec.id}`);
      const errorMessage = detail.data?.resultData?.error?.message || '';

      let category = 'UNKNOWN';
      if (errorMessage.includes('401') || errorMessage.includes('auth')) {
        category = 'AUTH';
      } else if (errorMessage.includes('429') || errorMessage.includes('rate')) {
        category = 'RATE_LIMIT';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        category = 'TIMEOUT';
      } else if (errorMessage.includes('400') || errorMessage.includes('invalid')) {
        category = 'VALIDATION';
      } else if (errorMessage.includes('500') || errorMessage.includes('server')) {
        category = 'SERVER';
      }

      errorCategories[category].push({
        executionId: exec.id,
        timestamp: exec.startedAt,
        message: errorMessage.substring(0, 200)
      });
    } catch (e) {
      // Skip inaccessible executions
    }
  }

  const categorySummary = Object.entries(errorCategories)
    .map(([category, errors]) => ({
      category,
      count: errors.length,
      percentage: total > 0 ? (errors.length / total * 100).toFixed(1) : 0,
      latestError: errors[0]?.message || null
    }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    workflowId,
    totalExecutions: total,
    failedExecutions: failed.length,
    errorRate: `${errorRate}%`,
    categories: categorySummary,
    recommendations: generateErrorRecommendations(categorySummary)
  };
}

/**
 * Generate recommendations based on error patterns
 */
function generateErrorRecommendations(categories) {
  const recommendations = [];

  for (const { category, count, percentage } of categories) {
    if (count === 0) continue;

    switch (category) {
      case 'AUTH':
        recommendations.push({
          priority: 'HIGH',
          issue: 'Authentication failures detected',
          action: 'Check credential expiration and refresh OAuth tokens'
        });
        break;

      case 'RATE_LIMIT':
        recommendations.push({
          priority: 'MEDIUM',
          issue: 'Rate limiting detected',
          action: 'Add Wait nodes between API calls or reduce batch sizes'
        });
        break;

      case 'TIMEOUT':
        recommendations.push({
          priority: 'MEDIUM',
          issue: 'Timeout errors detected',
          action: 'Increase timeout settings or split large operations'
        });
        break;

      case 'VALIDATION':
        recommendations.push({
          priority: 'LOW',
          issue: 'Validation errors detected',
          action: 'Add input validation nodes to catch bad data early'
        });
        break;

      case 'SERVER':
        recommendations.push({
          priority: 'HIGH',
          issue: 'Server errors detected',
          action: 'Add retry logic with exponential backoff for external APIs'
        });
        break;
    }
  }

  return recommendations;
}

/**
 * Generate comprehensive optimization recommendations
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<object>} Recommendations
 */
async function generateRecommendations(workflowId) {
  const workflow = await n8nRequest(`/workflows/${workflowId}`);
  const executions = await getExecutions(workflowId, 50);
  const errorAnalysis = await analyzeErrors(workflowId);
  const bottlenecks = await identifyBottlenecks(workflowId);

  const recommendations = [];

  // Check for error handling
  const hasErrorTrigger = workflow.nodes?.some(n =>
    n.type === 'n8n-nodes-base.errorTrigger'
  );
  if (!hasErrorTrigger) {
    recommendations.push({
      priority: 'HIGH',
      category: 'RELIABILITY',
      issue: 'No error handling',
      action: 'Add Error Trigger node to catch and handle failures',
      impact: 'Prevents silent failures and data loss'
    });
  }

  // Check for retry logic
  const hasRetry = workflow.nodes?.some(n =>
    n.parameters?.retryOnFail || n.parameters?.retry
  );
  if (!hasRetry && errorAnalysis.errorRate > 5) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'RELIABILITY',
      issue: 'No retry logic with significant error rate',
      action: 'Enable retry on fail for external API nodes',
      impact: 'Reduces failures from transient errors'
    });
  }

  // Check batch sizes for HTTP nodes
  const httpNodes = workflow.nodes?.filter(n =>
    n.type.includes('httpRequest') || n.type.includes('Http')
  ) || [];
  if (httpNodes.length > 3) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'PERFORMANCE',
      issue: 'Multiple sequential HTTP calls',
      action: 'Consider batching requests or using pagination',
      impact: 'Can reduce execution time by 40-60%'
    });
  }

  // Check for Wait nodes (rate limiting)
  const hasWait = workflow.nodes?.some(n => n.type.includes('wait'));
  if (!hasWait && httpNodes.length > 2) {
    recommendations.push({
      priority: 'LOW',
      category: 'RELIABILITY',
      issue: 'No rate limiting between API calls',
      action: 'Add Wait nodes to prevent rate limiting',
      impact: 'Prevents API throttling and failures'
    });
  }

  // Check execution duration
  const durationStats = calculateDurationStats(executions);
  if (durationStats.p95 > 60000) { // Over 1 minute
    recommendations.push({
      priority: 'MEDIUM',
      category: 'PERFORMANCE',
      issue: 'Long execution times detected',
      action: 'Consider splitting into multiple workflows or async processing',
      impact: 'Prevents timeouts and improves reliability'
    });
  }

  // Add error-based recommendations
  recommendations.push(...errorAnalysis.recommendations);

  // Sort by priority
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    workflowId,
    workflowName: workflow.name,
    recommendations,
    metrics: {
      errorRate: errorAnalysis.errorRate,
      avgDuration: `${durationStats.avg}ms`,
      p95Duration: `${durationStats.p95}ms`,
      nodeCount: workflow.nodes?.length || 0
    },
    summary: recommendations.length > 0
      ? `${recommendations.length} optimization(s) recommended`
      : 'Workflow is well optimized'
  };
}

/**
 * Calculate overall efficiency score (0-100)
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<object>} Efficiency score
 */
async function calculateScore(workflowId) {
  const workflow = await n8nRequest(`/workflows/${workflowId}`);
  const executions = await getExecutions(workflowId, 50);

  let score = 100;
  const factors = [];

  // Factor 1: Error rate (-5 to -30 points)
  const failed = executions.filter(e => e.status === 'error').length;
  const errorRate = executions.length > 0 ? failed / executions.length : 0;
  const errorPenalty = Math.min(30, Math.round(errorRate * 100));
  score -= errorPenalty;
  factors.push({
    factor: 'Error Rate',
    value: `${(errorRate * 100).toFixed(1)}%`,
    impact: `-${errorPenalty}`,
    status: errorRate < 0.05 ? 'GOOD' : errorRate < 0.15 ? 'FAIR' : 'POOR'
  });

  // Factor 2: Error handling (+10 or -10)
  const hasErrorHandling = workflow.nodes?.some(n =>
    n.type === 'n8n-nodes-base.errorTrigger'
  );
  if (hasErrorHandling) {
    factors.push({
      factor: 'Error Handling',
      value: 'Present',
      impact: '+0',
      status: 'GOOD'
    });
  } else {
    score -= 10;
    factors.push({
      factor: 'Error Handling',
      value: 'Missing',
      impact: '-10',
      status: 'POOR'
    });
  }

  // Factor 3: Execution speed
  const durationStats = calculateDurationStats(executions);
  if (durationStats.p95 > 120000) { // Over 2 minutes
    score -= 15;
    factors.push({
      factor: 'Execution Speed',
      value: `${Math.round(durationStats.p95 / 1000)}s (p95)`,
      impact: '-15',
      status: 'POOR'
    });
  } else if (durationStats.p95 > 60000) { // Over 1 minute
    score -= 5;
    factors.push({
      factor: 'Execution Speed',
      value: `${Math.round(durationStats.p95 / 1000)}s (p95)`,
      impact: '-5',
      status: 'FAIR'
    });
  } else {
    factors.push({
      factor: 'Execution Speed',
      value: `${Math.round(durationStats.p95 / 1000)}s (p95)`,
      impact: '+0',
      status: 'GOOD'
    });
  }

  // Factor 4: Complexity
  const nodeCount = workflow.nodes?.length || 0;
  if (nodeCount > 30) {
    score -= 10;
    factors.push({
      factor: 'Complexity',
      value: `${nodeCount} nodes`,
      impact: '-10',
      status: 'POOR'
    });
  } else if (nodeCount > 20) {
    score -= 5;
    factors.push({
      factor: 'Complexity',
      value: `${nodeCount} nodes`,
      impact: '-5',
      status: 'FAIR'
    });
  } else {
    factors.push({
      factor: 'Complexity',
      value: `${nodeCount} nodes`,
      impact: '+0',
      status: 'GOOD'
    });
  }

  // Factor 5: Consistency (variance in execution time)
  if (durationStats.sampleSize > 5) {
    const variance = durationStats.max - durationStats.min;
    const varianceRatio = variance / (durationStats.avg || 1);

    if (varianceRatio > 5) {
      score -= 10;
      factors.push({
        factor: 'Consistency',
        value: `${varianceRatio.toFixed(1)}x variance`,
        impact: '-10',
        status: 'POOR'
      });
    } else if (varianceRatio > 2) {
      score -= 5;
      factors.push({
        factor: 'Consistency',
        value: `${varianceRatio.toFixed(1)}x variance`,
        impact: '-5',
        status: 'FAIR'
      });
    } else {
      factors.push({
        factor: 'Consistency',
        value: `${varianceRatio.toFixed(1)}x variance`,
        impact: '+0',
        status: 'GOOD'
      });
    }
  }

  // Ensure score is between 0 and 100
  score = Math.max(0, Math.min(100, score));

  let grade;
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';

  return {
    workflowId,
    workflowName: workflow.name,
    score,
    grade,
    factors,
    sampleSize: executions.length,
    summary: `Efficiency Score: ${score}/100 (${grade})`
  };
}

/**
 * Compare two workflows
 * @param {string} id1 - First workflow ID
 * @param {string} id2 - Second workflow ID
 * @returns {Promise<object>} Comparison result
 */
async function compareWorkflows(id1, id2) {
  const [score1, score2] = await Promise.all([
    calculateScore(id1),
    calculateScore(id2)
  ]);

  const [exec1, exec2] = await Promise.all([
    getExecutions(id1, 50),
    getExecutions(id2, 50)
  ]);

  const duration1 = calculateDurationStats(exec1);
  const duration2 = calculateDurationStats(exec2);

  return {
    workflows: [
      {
        id: id1,
        name: score1.workflowName,
        score: score1.score,
        grade: score1.grade,
        avgDuration: duration1.avg,
        errorRate: score1.factors.find(f => f.factor === 'Error Rate')?.value
      },
      {
        id: id2,
        name: score2.workflowName,
        score: score2.score,
        grade: score2.grade,
        avgDuration: duration2.avg,
        errorRate: score2.factors.find(f => f.factor === 'Error Rate')?.value
      }
    ],
    winner: score1.score >= score2.score ? id1 : id2,
    scoreDiff: Math.abs(score1.score - score2.score),
    durationDiff: `${Math.abs(duration1.avg - duration2.avg)}ms`,
    summary: score1.score === score2.score
      ? 'Workflows are equally efficient'
      : `${score1.score > score2.score ? score1.workflowName : score2.workflowName} is more efficient`
  };
}

/**
 * Full analysis combining all metrics
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<object>} Complete analysis
 */
async function fullAnalysis(workflowId) {
  const [score, bottlenecks, errors, recommendations] = await Promise.all([
    calculateScore(workflowId),
    identifyBottlenecks(workflowId),
    analyzeErrors(workflowId),
    generateRecommendations(workflowId)
  ]);

  return {
    workflowId,
    workflowName: score.workflowName,
    overallScore: {
      score: score.score,
      grade: score.grade,
      factors: score.factors
    },
    performance: {
      bottlenecks: bottlenecks.bottlenecks.slice(0, 5),
      summary: bottlenecks.summary
    },
    reliability: {
      errorRate: errors.errorRate,
      categories: errors.categories.slice(0, 3)
    },
    recommendations: recommendations.recommendations.slice(0, 5),
    generatedAt: new Date().toISOString()
  };
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const parsed = {
    command: args[0],
    target: null,
    options: {}
  };

  if (args[1] && !args[1].startsWith('--')) {
    parsed.target = args[1];
  }

  if (args[2] && !args[2].startsWith('--')) {
    parsed.secondTarget = args[2];
  }

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--json') {
      parsed.options.json = true;
    } else if (args[i] === '--verbose') {
      parsed.options.verbose = true;
    }
  }

  return parsed;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
n8n Workflow Optimizer v1.0.0

Usage:
  node n8n-workflow-optimizer.js <command> <workflow-id> [options]

Commands:
  analyze <workflow-id>           Full analysis with all metrics
  bottlenecks <workflow-id>       Identify slowest nodes
  errors <workflow-id>            Error pattern analysis
  recommendations <workflow-id>   Get optimization recommendations
  score <workflow-id>             Calculate efficiency score (0-100)
  compare <id1> <id2>             Compare two workflows

Options:
  --json          Output in JSON format
  --verbose       Include additional details

Environment Variables:
  N8N_API_KEY     n8n API key (required)
  N8N_BASE_URL    n8n instance URL (default: https://your-instance.n8n.cloud)

Examples:
  # Full analysis
  node n8n-workflow-optimizer.js analyze abc123

  # Find performance bottlenecks
  node n8n-workflow-optimizer.js bottlenecks abc123

  # Get actionable recommendations
  node n8n-workflow-optimizer.js recommendations abc123

  # Score comparison
  node n8n-workflow-optimizer.js compare abc123 def456
`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const parsed = parseArgs(args);
  const outputJson = parsed.options.json;

  try {
    let result;

    switch (parsed.command) {
      case 'analyze':
        if (!parsed.target) throw new Error('Workflow ID required');
        result = await fullAnalysis(parsed.target);
        break;

      case 'bottlenecks':
        if (!parsed.target) throw new Error('Workflow ID required');
        result = await identifyBottlenecks(parsed.target);
        break;

      case 'errors':
        if (!parsed.target) throw new Error('Workflow ID required');
        result = await analyzeErrors(parsed.target);
        break;

      case 'recommendations':
        if (!parsed.target) throw new Error('Workflow ID required');
        result = await generateRecommendations(parsed.target);
        break;

      case 'score':
        if (!parsed.target) throw new Error('Workflow ID required');
        result = await calculateScore(parsed.target);
        break;

      case 'compare':
        if (!parsed.target || !parsed.secondTarget) {
          throw new Error('Two workflow IDs required');
        }
        result = await compareWorkflows(parsed.target, parsed.secondTarget);
        break;

      default:
        throw new Error(`Unknown command: ${parsed.command}`);
    }

    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Pretty print
      console.log(`\n${'='.repeat(60)}`);
      console.log(result.summary || `Analysis for ${result.workflowName || result.workflowId}`);
      console.log('='.repeat(60));

      if (result.score !== undefined) {
        console.log(`\nEfficiency Score: ${result.score}/100 (Grade: ${result.grade})\n`);
      }

      if (result.factors) {
        console.log('Scoring Factors:');
        console.table(result.factors);
      }

      if (result.bottlenecks) {
        console.log('\nBottlenecks (slowest nodes):');
        console.table(result.bottlenecks);
      }

      if (result.categories) {
        console.log('\nError Categories:');
        console.table(result.categories);
      }

      if (result.recommendations && result.recommendations.length > 0) {
        console.log('\nRecommendations:');
        result.recommendations.forEach((r, i) => {
          console.log(`\n${i + 1}. [${r.priority}] ${r.issue}`);
          console.log(`   Action: ${r.action}`);
          if (r.impact) console.log(`   Impact: ${r.impact}`);
        });
      }

      if (result.workflows) {
        console.log('\nWorkflow Comparison:');
        console.table(result.workflows);
        console.log(`\nWinner: ${result.winner}`);
      }

      console.log('');
    }

    process.exit(0);

  } catch (error) {
    if (outputJson) {
      console.log(JSON.stringify({ success: false, error: error.message }));
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for programmatic use
module.exports = {
  fullAnalysis,
  identifyBottlenecks,
  analyzeErrors,
  generateRecommendations,
  calculateScore,
  compareWorkflows
};
