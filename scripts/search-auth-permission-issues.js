#!/usr/bin/env node

/**
 * Search for Auth/Permission-Related Issues in Reflections
 *
 * Searches the issues_identified JSONB array for keywords:
 * - auth, permission, access, profile
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function searchAuthPermissionIssues() {
  try {
    // Get all reflections and filter in memory (more reliable than JSONB queries)
    const { data, error } = await supabase
      .from('reflections')
      .select('id, created_at, org, focus_area, reflection_status, total_issues, data')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('❌ Query error:', JSON.stringify(error, null, 2));
      process.exit(1);
    }

    console.log('\n# Reflections with Auth/Permission-Related Issues');
    console.log('=================================================\n');

    const authRelatedReflections = data.filter(r => {
      if (!r.data || !r.data.issues_identified) return false;

      const issuesText = JSON.stringify(r.data.issues_identified).toLowerCase();
      return issuesText.includes('auth') ||
             issuesText.includes('permission') ||
             issuesText.includes('access') ||
             issuesText.includes('profile');
    });

    if (authRelatedReflections.length === 0) {
      console.log('No reflections found with auth/permission-related issues.');
      process.exit(0);
    }

    authRelatedReflections.slice(0, 10).forEach((r, i) => {
      console.log(`${i + 1}. ID: ${r.id}`);
      console.log(`   Created: ${r.created_at}`);
      console.log(`   Org: ${r.org || 'N/A'}`);
      console.log(`   Focus: ${r.focus_area || 'N/A'}`);
      console.log(`   Status: ${r.reflection_status || 'N/A'}`);
      console.log(`   Total Issues: ${r.total_issues || 0}`);

      if (r.data && r.data.issues_identified) {
        const authRelatedIssues = r.data.issues_identified.filter(issue => {
          const issueText = JSON.stringify(issue).toLowerCase();
          return issueText.includes('auth') ||
                 issueText.includes('permission') ||
                 issueText.includes('access') ||
                 issueText.includes('profile');
        });

        console.log(`   Auth-related issues: ${authRelatedIssues.length}`);
        authRelatedIssues.slice(0, 3).forEach((issue, idx) => {
          const desc = issue.description || issue.issue || 'N/A';
          const taxonomy = issue.taxonomy || 'unknown';
          const priority = issue.priority || 'unknown';
          console.log(`     ${idx + 1}. [${taxonomy}/${priority}] ${desc.substring(0, 150)}${desc.length > 150 ? '...' : ''}`);
        });
      }

      console.log('');
    });

    console.log(`\nFound ${authRelatedReflections.length} reflections with auth/permission issues (showing first 10)`);

    // Output summary stats
    console.log('\n\n# Summary Statistics');
    console.log('===================');
    const orgCounts = {};
    const focusCounts = {};
    authRelatedReflections.forEach(r => {
      orgCounts[r.org] = (orgCounts[r.org] || 0) + 1;
      focusCounts[r.focus_area] = (focusCounts[r.focus_area] || 0) + 1;
    });

    console.log('\nBy Organization:');
    Object.entries(orgCounts).sort((a, b) => b[1] - a[1]).forEach(([org, count]) => {
      console.log(`  ${org}: ${count}`);
    });

    console.log('\nBy Focus Area:');
    Object.entries(focusCounts).sort((a, b) => b[1] - a[1]).forEach(([focus, count]) => {
      console.log(`  ${focus}: ${count}`);
    });

  } catch (err) {
    console.error('❌ Exception:', err);
    process.exit(1);
  }
}

searchAuthPermissionIssues();
