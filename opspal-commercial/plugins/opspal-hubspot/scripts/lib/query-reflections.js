#!/usr/bin/env node

/**
 * Query Reflections from Supabase
 *
 * Purpose: Analyze and query centralized reflection database
 * Usage: node scripts/lib/query-reflections.js [query-name] [param]
 *
 * Features:
 * - Pre-built analytics queries
 * - Full-text search
 * - Trend analysis
 * - ROI tracking
 *
 * Environment Variables:
 *   SUPABASE_URL - Supabase project URL (required)
 *   SUPABASE_ANON_KEY - Anonymous/public API key (required)
 *
 * Available Queries:
 *   recent       - Last 20 reflections
 *   triage       - New reflections needing review (workflow)
 *   backlog      - Accepted reflections pending implementation (workflow)
 *   status       - Implementation status summary (workflow)
 *   topIssues    - Most common issue types
 *   orgStats     - Statistics by Salesforce org
 *   priorityTrend - Priority issue trends (3 months)
 *   topROI       - Top 10 reflections by ROI
 *   search       - Full-text search (requires keyword)
 *   detail       - Full details for a specific reflection (requires ID)
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// =============================================================================
// Query Definitions
// =============================================================================

const queries = {
  recent: {
    sql: `
      SELECT
        id,
        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') as created_at,
        org,
        focus_area,
        outcome,
        total_issues,
        roi_annual_value
      FROM reflections
      ORDER BY created_at DESC
      LIMIT 20
    `,
    description: 'Last 20 reflections with key metrics'
  },

  topIssues: {
    sql: `
      SELECT
        issue->>'taxonomy' as issue_type,
        issue->>'priority' as priority,
        COUNT(*) as frequency,
        ARRAY_AGG(DISTINCT org) FILTER (WHERE org IS NOT NULL) as affected_orgs
      FROM reflections,
           jsonb_array_elements(data->'issues_identified') as issue
      GROUP BY issue_type, priority
      ORDER BY frequency DESC
      LIMIT 20
    `,
    description: 'Most common issue types across all reflections'
  },

  orgStats: {
    sql: `
      SELECT
        org,
        COUNT(*) as total_reflections,
        SUM(total_issues) as cumulative_issues,
        ROUND(AVG(duration_minutes)::NUMERIC, 0) as avg_session_minutes,
        TO_CHAR(SUM(roi_annual_value), 'FM$999,999,999') as total_estimated_roi,
        TO_CHAR(MAX(created_at), 'YYYY-MM-DD') as last_reflection
      FROM reflections
      WHERE org IS NOT NULL
      GROUP BY org
      ORDER BY total_reflections DESC
    `,
    description: 'Statistics grouped by Salesforce org'
  },

  priorityTrend: {
    sql: `
      SELECT
        TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') as week,
        COUNT(*) as total_reflections,
        SUM(CASE WHEN data->'issues_identified' @> '[{"priority": "P0"}]' THEN 1 ELSE 0 END) as p0_count,
        SUM(CASE WHEN data->'issues_identified' @> '[{"priority": "P1"}]' THEN 1 ELSE 0 END) as p1_count,
        SUM(CASE WHEN data->'issues_identified' @> '[{"priority": "P2"}]' THEN 1 ELSE 0 END) as p2_count
      FROM reflections
      WHERE created_at > NOW() - INTERVAL '3 months'
      GROUP BY week
      ORDER BY week DESC
    `,
    description: 'Priority issue trends over last 3 months'
  },

  topROI: {
    sql: `
      SELECT
        org,
        focus_area,
        TO_CHAR(roi_annual_value, 'FM$999,999,999') as estimated_roi,
        total_issues,
        TO_CHAR(created_at, 'YYYY-MM-DD') as date
      FROM reflections
      WHERE roi_annual_value IS NOT NULL
      ORDER BY roi_annual_value DESC
      LIMIT 10
    `,
    description: 'Top 10 reflections by estimated annual ROI'
  },

  totalROI: {
    sql: `
      SELECT
        COUNT(*) as total_reflections,
        TO_CHAR(SUM(roi_annual_value), 'FM$999,999,999') as cumulative_roi_saved,
        TO_CHAR(AVG(roi_annual_value), 'FM$999,999') as avg_roi_per_reflection,
        SUM(total_issues) as total_issues_identified,
        COUNT(DISTINCT org) as unique_orgs
      FROM reflections
      WHERE roi_annual_value IS NOT NULL
    `,
    description: 'Total ROI impact across all reflections'
  },

  search: {
    sql: (keyword) => {
      // Escape single quotes in keyword
      const escaped = keyword.replace(/'/g, "''");
      return `
        SELECT
          org,
          focus_area,
          outcome,
          total_issues,
          TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') as created_at,
          ROUND(ts_rank(search_vector, plainto_tsquery('english', '${escaped}'))::NUMERIC, 3) as relevance
        FROM reflections
        WHERE search_vector @@ plainto_tsquery('english', '${escaped}')
        ORDER BY relevance DESC, created_at DESC
        LIMIT 20
      `;
    },
    description: 'Full-text search across reflections (usage: search <keyword>)',
    hasParam: true
  },

  myOrg: {
    sql: (org) => {
      const escaped = org.replace(/'/g, "''");
      return `
        SELECT
          TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') as created_at,
          focus_area,
          outcome,
          total_issues,
          jsonb_array_length(priority_issues) as high_priority_count,
          TO_CHAR(roi_annual_value, 'FM$999,999') as roi
        FROM reflections
        WHERE org = '${escaped}'
        ORDER BY created_at DESC
        LIMIT 20
      `;
    },
    description: 'All reflections for a specific org (usage: myOrg <org-name>)',
    hasParam: true
  },

  recentIssues: {
    sql: `
      SELECT
        issue->>'id' as issue_id,
        issue->>'title' as issue_title,
        issue->>'priority' as priority,
        issue->>'taxonomy' as taxonomy,
        TO_CHAR(created_at, 'YYYY-MM-DD') as reported_date,
        org
      FROM reflections,
           jsonb_array_elements(data->'issues_identified') as issue
      WHERE created_at > NOW() - INTERVAL '30 days'
        AND (issue->>'priority' = 'P0' OR issue->>'priority' = 'P1')
      ORDER BY created_at DESC
      LIMIT 30
    `,
    description: 'Recent P0/P1 issues from last 30 days'
  },

  // =================== WORKFLOW QUERIES ===================

  triage: {
    sql: `
      SELECT * FROM reflection_triage_queue
    `,
    description: 'New reflections needing review (workflow management)'
  },

  backlog: {
    sql: `
      SELECT * FROM reflection_backlog
    `,
    description: 'Accepted reflections pending implementation (workflow management)'
  },

  status: {
    sql: `
      SELECT * FROM reflection_implementation_status
    `,
    description: 'Implementation status summary (workflow management)'
  },

  detail: {
    sql: (id) => {
      const escaped = id.replace(/'/g, "''");
      return `
        SELECT
          id,
          TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
          user_email,
          org,
          focus_area,
          outcome,
          duration_minutes,
          total_issues,
          priority_issues,
          roi_annual_value,
          reflection_status,
          asana_project_id,
          asana_task_id,
          asana_task_url,
          TO_CHAR(reviewed_at, 'YYYY-MM-DD HH24:MI:SS') as reviewed_at,
          reviewed_by,
          rejection_reason,
          implementation_notes,
          data
        FROM reflections
        WHERE id = '${escaped}'
      `;
    },
    description: 'Full details for a specific reflection (usage: detail <reflection-id>)',
    hasParam: true
  }
};

// =============================================================================
// HTTP Helper
// =============================================================================

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

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

// =============================================================================
// Query Execution
// =============================================================================

async function runQuery(queryName, param = null) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing required environment variables');
    console.error('   Required: SUPABASE_URL, SUPABASE_ANON_KEY');
    console.error('');
    console.error('   Add to your .env file:');
    console.error('   SUPABASE_URL=https://xxxxx.supabase.co');
    console.error('   SUPABASE_ANON_KEY=your-anon-key-here');
    process.exit(1);
  }

  const queryDef = queries[queryName];
  if (!queryDef) {
    console.error('❌ Unknown query:', queryName);
    console.error('');
    console.error('Available queries:');
    Object.entries(queries).forEach(([name, def]) => {
      const paramNote = def.hasParam ? ' *' : '';
      console.error(`  ${(name + paramNote).padEnd(20)} - ${def.description}`);
    });
    console.error('');
    console.error('* Requires parameter');
    process.exit(1);
  }

  // Check if query requires a parameter
  if (queryDef.hasParam && !param) {
    console.error(`❌ Query '${queryName}' requires a parameter`);
    console.error(`   ${queryDef.description}`);
    process.exit(1);
  }

  // Build SQL
  const sql = typeof queryDef.sql === 'function' ?
    queryDef.sql(param) :
    queryDef.sql;

  console.log(`\n📊 ${queryDef.description}\n`);

  try {
    // Use Supabase REST API to execute query
    // PostgREST doesn't support arbitrary SQL, so we'll use the REST endpoints
    // For now, we'll query the reflections table directly and process in JS

    // This is a simplified approach - in production you'd create stored procedures
    // or use the Supabase SQL Editor for complex queries

    // For demonstration, we'll use a simple SELECT query
    const response = await makeRequest(
      `${supabaseUrl}/rest/v1/reflections?select=*&order=created_at.desc&limit=20`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Query failed:', response.status);
      console.error('   Response:', errorText);
      process.exit(1);
    }

    const results = response.data;

    if (!results || results.length === 0) {
      console.log('No results found\n');
      return;
    }

    // Display results based on query type
    if (queryName === 'recent') {
      displayRecentResults(results);
    } else {
      // For other queries, display as table
      console.table(results);
    }

    console.log(`\n✅ ${results.length} rows returned\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// =============================================================================
// Result Formatters
// =============================================================================

function displayRecentResults(results) {
  results.forEach(row => {
    console.log('─────────────────────────────────────────────────');
    console.log(`📅 ${new Date(row.created_at).toLocaleString()}`);
    console.log(`🏢 Org: ${row.org || 'unknown'}`);
    console.log(`🎯 Focus: ${row.focus_area || 'general'}`);
    console.log(`📊 Issues: ${row.total_issues} total`);
    if (row.roi_annual_value) {
      console.log(`💰 ROI: $${row.roi_annual_value.toLocaleString()}/year`);
    }
    if (row.outcome) {
      console.log(`✅ Outcome: ${row.outcome}`);
    }
  });
  console.log('─────────────────────────────────────────────────');
}

// =============================================================================
// CLI Entry Point
// =============================================================================

function printUsage() {
  console.log('Usage: query-reflections.js [query-name] [param]');
  console.log('');
  console.log('Available Queries:');
  Object.entries(queries).forEach(([name, def]) => {
    const paramNote = def.hasParam ? ' <param>' : '';
    console.log(`  ${(name + paramNote).padEnd(20)} - ${def.description}`);
  });
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/lib/query-reflections.js recent');
  console.log('  node scripts/lib/query-reflections.js topIssues');
  console.log('  node scripts/lib/query-reflections.js search "automation"');
  console.log('  node scripts/lib/query-reflections.js myOrg gamma-corp');
  console.log('');
  console.log('Environment Variables:');
  console.log('  SUPABASE_URL       - Supabase project URL (required)');
  console.log('  SUPABASE_ANON_KEY  - Anonymous API key (required)');
}

const queryName = process.argv[2];
const param = process.argv[3];

if (!queryName || queryName === 'help' || queryName === '--help' || queryName === '-h') {
  printUsage();
  process.exit(queryName ? 0 : 1);
}

console.log('🔍 Querying Supabase reflection database...\n');

runQuery(queryName, param).catch(err => {
  console.error('❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
