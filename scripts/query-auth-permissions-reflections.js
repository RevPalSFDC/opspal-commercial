#!/usr/bin/env node

/**
 * Query Auth/Permissions Cohort Reflections from Supabase
 *
 * Finds reflections where:
 * 1. cohort_id contains 'auth' or 'permission'
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function queryAuthPermissionReflections() {
  try {
    const { data, error } = await supabase
      .from('reflections')
      .select('id, data, cohort_id, created_at, org, focus_area, outcome, reflection_status, total_issues')
      .or('cohort_id.ilike.%auth%,cohort_id.ilike.%permission%')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('❌ Query error:', JSON.stringify(error, null, 2));
      process.exit(1);
    }

    // Format output for readability
    console.log('\n# Auth/Permissions Cohort Reflections');
    console.log('=====================================\n');

    if (!data || data.length === 0) {
      console.log('No reflections found matching the criteria.');
      process.exit(0);
    }

    data.forEach((reflection, index) => {
      console.log(`${index + 1}. ID: ${reflection.id}`);
      console.log(`   Created: ${reflection.created_at}`);
      console.log(`   Org: ${reflection.org || 'N/A'}`);
      console.log(`   Focus Area: ${reflection.focus_area || 'N/A'}`);
      console.log(`   Cohort ID: ${reflection.cohort_id || 'N/A'}`);
      console.log(`   Status: ${reflection.reflection_status || 'N/A'}`);
      console.log(`   Total Issues: ${reflection.total_issues || 0}`);
      console.log(`   Outcome: ${reflection.outcome || 'N/A'}`);

      // Extract data from JSONB
      if (reflection.data) {
        const primary_category = reflection.data.primary_category || 'N/A';
        const root_cause = reflection.data.root_cause_hypothesis || 'N/A';
        const error_message = reflection.data.error_message || reflection.data.error_details || 'N/A';

        console.log(`   Primary Category: ${primary_category}`);
        console.log(`   Root Cause: ${root_cause}`);

        const errorMsg = typeof error_message === 'string' ? error_message : JSON.stringify(error_message);
        const truncatedMsg = errorMsg.length > 200 ? errorMsg.substring(0, 200) + '...' : errorMsg;
        console.log(`   Error (first 200 chars): ${truncatedMsg}`);
      }

      console.log('');
    });

    console.log(`\nTotal results: ${data.length}`);

    // Also output raw JSON for programmatic use
    console.log('\n\n# Raw JSON Output');
    console.log('=================\n');
    console.log(JSON.stringify(data, null, 2));

  } catch (err) {
    console.error('❌ Exception:', err);
    process.exit(1);
  }
}

queryAuthPermissionReflections();
