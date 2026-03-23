#!/usr/bin/env node

/**
 * Query New Reflections from Supabase
 *
 * Purpose: Fetch all reflections with status='new' for cohort analysis
 * Usage: node scripts/query-new-reflections.js
 *
 * Features:
 * - Queries reflections table for status='new'
 * - Generates structured JSON output for cohort detector
 * - Saves results to reports directory
 * - No external dependencies (uses native Node.js)
 *
 * Environment Variables:
 *   SUPABASE_URL - Supabase project URL (required)
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for unrestricted access (required)
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Error (missing config, query failure, network failure)
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');

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
function makeRequest(url, options) {
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
            data: data ? JSON.parse(data) : null,
            text: () => Promise.resolve(data)
          });
        } else {
          resolve({
            ok: false,
            status: res.statusCode,
            data: null,
            text: () => Promise.resolve(data)
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

/**
 * Main query function
 */
async function queryNewReflections() {
  // Use hardcoded defaults (can be overridden with environment variables)
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    console.error('❌ SUPABASE_URL environment variable is required');
    process.exit(1);
  }
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    process.exit(1);
  }

  console.error('Querying reflections with status="new"...');

  try {
    // Query reflections table
    const response = await makeRequest(
      `${supabaseUrl}/rest/v1/reflections?reflection_status=eq.new&order=created_at.desc`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Supabase API error:', response.status);
      console.error('   Response:', errorText);

      // Provide helpful error messages
      if (response.status === 401 || response.status === 403) {
        console.error('');
        console.error('   This may be a permissions issue:');
        console.error('   - Check that SUPABASE_SERVICE_ROLE_KEY is correct');
        console.error('   - Verify the key has unrestricted access (service role)');
      } else if (response.status === 404) {
        console.error('');
        console.error('   The reflections table may not exist:');
        console.error('   - Run scripts/supabase-schema.sql in Supabase SQL Editor');
      }

      process.exit(1);
    }

    const data = response.data;
    console.error(`Found ${data.length} reflections with status='new'`);

    // Build structured output for cohort detector
    const output = {
      total_reflections: data.length,
      query_timestamp: new Date().toISOString(),
      reflections: data.map(row => ({
        id: row.id,
        org: row.org,
        created_at: row.created_at,
        focus_area: row.focus_area,
        outcome: row.outcome,
        total_issues: row.total_issues,
        roi_annual_value: row.roi_annual_value,
        duration_minutes: row.duration_minutes,
        reflection_status: row.reflection_status,
        data: row.data
      }))
    };

    // Save to file
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const reportsDir = path.join(__dirname, '../reports');
    const outputFile = path.join(reportsDir, `open-reflections-${timestamp}.json`);

    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

    console.error(`✅ Output saved to: ${outputFile}`);
    console.error('');

    // Also print to stdout for piping
    console.log(JSON.stringify(output, null, 2));

    return output;
  } catch (error) {
    console.error('❌ Network error:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  - Check your internet connection');
    console.error('  - Verify SUPABASE_URL is correct');
    console.error('  - Try accessing', supabaseUrl, 'in your browser');
    process.exit(1);
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

function printUsage() {
  console.log('Usage: query-new-reflections.js');
  console.log('');
  console.log('Environment Variables:');
  console.log('  SUPABASE_URL              - Supabase project URL (optional, has default)');
  console.log('  SUPABASE_SERVICE_ROLE_KEY - Service role API key (optional, has default)');
  console.log('');
  console.log('Example:');
  console.log('  node scripts/query-new-reflections.js');
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printUsage();
  process.exit(0);
}

// Run query
queryNewReflections().catch(err => {
  console.error('❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
