#!/usr/bin/env node
/**
 * query-unknown-cohorts.js
 *
 * Query Supabase reflections table for reflections in "unknown" cohort or with no cohort assignment.
 * Used for triaging reflections that need proper cohort classification.
 *
 * Usage:
 *   node scripts/query-unknown-cohorts.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

async function queryUnknownCohorts() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.error('🔍 Querying reflections with unknown/null cohort in open status...\n');

  const { data, error } = await supabase
    .from('reflections')
    .select('id, plugin_name, plugin_version, cohort_id, reflection_status, created_at, data, org, focus_area, total_issues')
    .or('cohort_id.eq.unknown,cohort_id.is.null')
    .eq('reflection_status', 'open')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Query error:', error);
    process.exit(1);
  }

  console.error(`✅ Found ${data.length} reflections\n`);

  // Extract relevant fields for triage
  const triageData = data.map(r => {
    // Extract error/trigger info from the JSONB data field
    const issuesIdentified = r.data?.issues_identified || r.data?.issues || [];
    const firstIssue = issuesIdentified[0] || {};
    const summary = r.data?.summary || null;

    return {
      id: r.id,
      plugin_name: r.plugin_name,
      plugin_version: r.plugin_version,
      cohort_id: r.cohort_id,
      reflection_status: r.reflection_status,
      created_at: r.created_at,
      summary: summary,
      org: r.org,
      focus_area: r.focus_area,
      total_issues: r.total_issues,

      // Extract error details from JSONB data
      error_type: firstIssue.error_type || r.data?.error_type || null,
      taxonomy: firstIssue.taxonomy || r.data?.taxonomy || null,
      root_cause: firstIssue.root_cause || r.data?.root_cause || null,
      title: firstIssue.title || null,
      description: firstIssue.description || null,

      // Include all issues for full context
      all_issues: issuesIdentified.map(i => ({
        title: i.title,
        taxonomy: i.taxonomy,
        error_type: i.error_type,
        root_cause: i.root_cause,
        priority: i.priority
      }))
    };
  });

  // Output JSON to stdout
  console.log(JSON.stringify(triageData, null, 2));

  // Print summary to stderr
  console.error('\n📊 Summary:');
  console.error(`  Total: ${triageData.length}`);
  console.error(`  With summary: ${triageData.filter(r => r.summary).length}`);
  console.error(`  With issues: ${triageData.filter(r => r.all_issues && r.all_issues.length > 0).length}`);
  console.error(`  By plugin:`);

  const byPlugin = triageData.reduce((acc, r) => {
    const plugin = r.plugin_name || 'unknown';
    acc[plugin] = (acc[plugin] || 0) + 1;
    return acc;
  }, {});

  Object.entries(byPlugin).forEach(([plugin, count]) => {
    console.error(`    ${plugin}: ${count}`);
  });

  console.error('\n📋 Suggested Cohort Classification:');
  console.error('  Use this data to determine proper cohorts:');
  console.error('  - data-quality: Data validation, fake data, missing fields');
  console.error('  - config/env: Missing credentials, API keys, environment setup');
  console.error('  - tool-contract: Tool parameter mismatches, MCP issues');
  console.error('  - schema/parse: JSON parse errors, XML issues, CSV format');
  console.error('  - external-api: API drift, 429 errors, service unavailable');
}

queryUnknownCohorts();
