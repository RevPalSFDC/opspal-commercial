#!/usr/bin/env node

/**
 * Runbook Reflection Bridge
 *
 * Purpose: Query Supabase reflection database and transform data into runbook sections
 * Usage: node scripts/lib/runbook-reflection-bridge.js --org <org-alias> [options]
 *
 * Features:
 * - Queries reflections from Supabase by org and timeframe
 * - Extracts patterns: common errors, exceptions, manual interventions
 * - Transforms reflection data into runbook-friendly sections
 * - Identifies known exceptions and recommendations
 *
 * Output Schema:
 * {
 *   org: string,
 *   reflections_analyzed: number,
 *   timeframe: { start: ISO, end: ISO },
 *   patterns: {
 *     common_errors: [{taxonomy, count, examples}],
 *     user_interventions: [{issue, action, frequency}],
 *     manual_workarounds: [{problem, solution, occurrences}]
 *   },
 *   known_exceptions: [{name, context, recommendation}],
 *   recommendations: [string]
 * }
 *
 * Environment Variables:
 *   SUPABASE_URL - Supabase project URL (default: embedded)
 *   SUPABASE_ANON_KEY - Anonymous API key (default: embedded)
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Error (connection failure, invalid args)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Load .env from project root (walk up from __dirname)
(function loadEnv() {
    let dir = __dirname;
    for (let i = 0; i < 6; i++) {
        const envPath = path.join(dir, '.env');
        if (fs.existsSync(envPath)) {
            for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
                const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)/);
                if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
            }
            break;
        }
        dir = path.dirname(dir);
    }
})();

/**
 * Make HTTP/HTTPS request using native Node.js modules
 */
function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            ok: true,
            status: res.statusCode,
            data: data ? JSON.parse(data) : null
          });
        } else {
          resolve({
            ok: false,
            status: res.statusCode,
            data: null,
            text: data
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Query reflections from Supabase
 */
async function queryReflections(org, options = {}) {
  const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
  const supabaseKey = options.supabaseKey || process.env.SUPABASE_ANON_KEY;

  // Build query parameters
  const queryParams = new URLSearchParams();
  queryParams.append('select', '*');
  queryParams.append('org', `eq.${org}`);
  queryParams.append('order', 'created_at.desc');

  // Apply limit
  const limit = options.limit || 50;
  queryParams.append('limit', limit.toString());

  // Apply timeframe filter if specified
  if (options.startDate) {
    queryParams.append('created_at', `gte.${options.startDate}`);
  }
  if (options.endDate) {
    queryParams.append('created_at', `lte.${options.endDate}`);
  }

  const queryUrl = `${supabaseUrl}/rest/v1/reflections?${queryParams.toString()}`;

  try {
    const response = await makeRequest(
      queryUrl,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase query failed: ${response.status} ${response.text}`);
    }

    return response.data || [];
  } catch (err) {
    console.error('❌ Failed to query reflections:', err.message);
    throw err;
  }
}

/**
 * Extract patterns from reflections
 */
function extractPatterns(reflections) {
  const patterns = {
    common_errors: {},
    user_interventions: [],
    manual_workarounds: []
  };

  reflections.forEach(reflection => {
    const data = reflection.data || {};
    const issues = data.issues_identified || data.issues || [];
    const feedback = data.user_feedback || [];

    // Extract errors by taxonomy
    issues.forEach(issue => {
      const taxonomy = issue.taxonomy || 'unknown';
      if (!patterns.common_errors[taxonomy]) {
        patterns.common_errors[taxonomy] = {
          taxonomy,
          count: 0,
          examples: []
        };
      }
      patterns.common_errors[taxonomy].count++;
      if (patterns.common_errors[taxonomy].examples.length < 3) {
        patterns.common_errors[taxonomy].examples.push({
          id: issue.id,
          description: issue.root_cause || issue.reproducible_trigger,
          priority: issue.priority
        });
      }
    });

    // Extract user interventions from feedback
    feedback.forEach(fb => {
      if (fb.classification === 'suggestion' || fb.classification === 'dissatisfaction') {
        patterns.user_interventions.push({
          comment: fb.raw_comment,
          classification: fb.classification,
          proposed_action: fb.proposed_action,
          linked_issue: fb.linked_issue_id
        });
      }
    });

    // Extract manual workarounds from playbook
    if (data.playbook && data.playbook.steps) {
      const manualSteps = data.playbook.steps.filter(step =>
        step.toLowerCase().includes('manual') ||
        step.toLowerCase().includes('workaround') ||
        step.toLowerCase().includes('override')
      );
      if (manualSteps.length > 0) {
        patterns.manual_workarounds.push({
          playbook: data.playbook.name,
          steps: manualSteps,
          trigger: data.playbook.trigger
        });
      }
    }
  });

  // Convert common_errors object to array and sort by count
  patterns.common_errors = Object.values(patterns.common_errors)
    .sort((a, b) => b.count - a.count);

  return patterns;
}

/**
 * Identify known exceptions from patterns
 */
function identifyKnownExceptions(patterns) {
  const exceptions = [];

  // Known exceptions from common errors
  patterns.common_errors.forEach(error => {
    if (error.count >= 2) {  // Occurred at least twice
      exceptions.push({
        name: `${error.taxonomy} (recurring)`,
        context: error.examples.map(ex => ex.description).join('; '),
        frequency: error.count,
        recommendation: `Implement validation for ${error.taxonomy} to prevent recurrence`
      });
    }
  });

  // Known exceptions from manual workarounds
  patterns.manual_workarounds.forEach(workaround => {
    exceptions.push({
      name: workaround.playbook,
      context: `Manual steps required: ${workaround.steps.join(', ')}`,
      frequency: 1,
      recommendation: `Automate manual steps in ${workaround.playbook}`
    });
  });

  return exceptions;
}

/**
 * Generate recommendations from patterns
 */
function generateRecommendations(patterns, knownExceptions) {
  const recommendations = [];

  // Recommendations from common errors
  const topErrors = patterns.common_errors.slice(0, 3);  // Top 3 most common
  topErrors.forEach(error => {
    recommendations.push(`Address recurring ${error.taxonomy} errors (${error.count} occurrences)`);
  });

  // Recommendations from user interventions
  const suggestions = patterns.user_interventions.filter(i => i.classification === 'suggestion');
  if (suggestions.length > 0) {
    recommendations.push(`Implement ${suggestions.length} user-suggested improvements`);
  }

  // Recommendations from manual workarounds
  if (patterns.manual_workarounds.length > 0) {
    recommendations.push(`Automate ${patterns.manual_workarounds.length} manual workarounds`);
  }

  // General recommendations
  if (knownExceptions.length > 5) {
    recommendations.push('High number of exceptions detected - consider comprehensive review');
  }

  return recommendations;
}

/**
 * Transform reflections into runbook sections
 */
function transformToRunbookSections(reflections, org) {
  // Extract timeframe
  const timestamps = reflections.map(r => new Date(r.created_at)).sort();
  const timeframe = timestamps.length > 0
    ? { start: timestamps[0].toISOString(), end: timestamps[timestamps.length - 1].toISOString() }
    : { start: null, end: null };

  // Extract patterns
  const patterns = extractPatterns(reflections);

  // Identify known exceptions
  const knownExceptions = identifyKnownExceptions(patterns);

  // Generate recommendations
  const recommendations = generateRecommendations(patterns, knownExceptions);

  return {
    org,
    reflections_analyzed: reflections.length,
    timeframe,
    patterns,
    known_exceptions: knownExceptions,
    recommendations
  };
}

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    org: null,
    limit: 50,
    startDate: null,
    endDate: null,
    output: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--org':
        options.org = next;
        i++;
        break;
      case '--limit':
        options.limit = parseInt(next, 10);
        i++;
        break;
      case '--start-date':
        options.startDate = next;
        i++;
        break;
      case '--end-date':
        options.endDate = next;
        i++;
        break;
      case '--output':
        options.output = next;
        i++;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`❌ Unknown option: ${arg}`);
          printUsage();
          process.exit(1);
        }
    }
  }

  return options;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Usage: runbook-reflection-bridge.js --org <org-alias> [options]');
  console.log('');
  console.log('Required Arguments:');
  console.log('  --org <alias>          Salesforce org alias');
  console.log('');
  console.log('Optional Arguments:');
  console.log('  --limit <number>       Max reflections to query (default: 50)');
  console.log('  --start-date <iso>     Filter reflections after this date (ISO 8601)');
  console.log('  --end-date <iso>       Filter reflections before this date (ISO 8601)');
  console.log('  --output <file>        Save output to JSON file (default: stdout)');
  console.log('');
  console.log('Examples:');
  console.log('  # Query recent reflections for delta-sandbox');
  console.log('  node runbook-reflection-bridge.js --org delta-sandbox');
  console.log('');
  console.log('  # Query last 100 reflections and save to file');
  console.log('  node runbook-reflection-bridge.js --org acme-production --limit 100 --output sections.json');
  console.log('');
  console.log('  # Query reflections from specific timeframe');
  console.log('  node runbook-reflection-bridge.js --org eta-corp \\');
  console.log('    --start-date 2025-09-01T00:00:00Z --end-date 2025-10-20T23:59:59Z');
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  // Validate required arguments
  if (!options.org) {
    console.error('❌ Missing required argument: --org');
    printUsage();
    process.exit(1);
  }

  try {
    // Query reflections from Supabase
    console.log(`🔍 Querying reflections for org: ${options.org}`);
    if (options.startDate || options.endDate) {
      console.log(`   Timeframe: ${options.startDate || 'any'} to ${options.endDate || 'now'}`);
    }
    console.log(`   Limit: ${options.limit}`);
    console.log('');

    const reflections = await queryReflections(options.org, {
      limit: options.limit,
      startDate: options.startDate,
      endDate: options.endDate
    });

    console.log(`✅ Found ${reflections.length} reflections`);
    console.log('');

    if (reflections.length === 0) {
      console.log('⚠️  No reflections found for this org');
      console.log('   This is normal if /reflect has not been run yet');
      process.exit(0);
    }

    // Transform to runbook sections
    console.log('🔄 Extracting patterns and generating sections...');
    const sections = transformToRunbookSections(reflections, options.org);

    console.log('✅ Analysis complete');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Reflections analyzed: ${sections.reflections_analyzed}`);
    console.log(`   Common error types: ${sections.patterns.common_errors.length}`);
    console.log(`   User interventions: ${sections.patterns.user_interventions.length}`);
    console.log(`   Manual workarounds: ${sections.patterns.manual_workarounds.length}`);
    console.log(`   Known exceptions: ${sections.known_exceptions.length}`);
    console.log(`   Recommendations: ${sections.recommendations.length}`);
    console.log('');

    // Output results
    if (options.output) {
      const fs = require('fs');
      const path = require('path');

      // Ensure output directory exists
      const outputDir = path.dirname(options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(options.output, JSON.stringify(sections, null, 2), 'utf-8');
      console.log(`📁 Saved to: ${options.output}`);
    } else {
      console.log('📄 Output:');
      console.log(JSON.stringify(sections, null, 2));
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.stack) {
      console.error('   Stack:', err.stack);
    }
    process.exit(1);
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

// Export for use as module
module.exports = {
  queryReflections,
  extractPatterns,
  identifyKnownExceptions,
  generateRecommendations,
  transformToRunbookSections
};
