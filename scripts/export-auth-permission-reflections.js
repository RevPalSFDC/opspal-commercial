#!/usr/bin/env node

/**
 * Export Auth/Permission Reflections to JSON
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function exportAuthPermissionReflections() {
  try {
    const { data, error } = await supabase
      .from('reflections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('❌ Query error:', error);
      process.exit(1);
    }

    const authRelatedReflections = data.filter(r => {
      if (!r.data || !r.data.issues_identified) return false;
      const issuesText = JSON.stringify(r.data.issues_identified).toLowerCase();
      return issuesText.includes('auth') ||
             issuesText.includes('permission') ||
             issuesText.includes('access') ||
             issuesText.includes('profile');
    });

    const output = {
      metadata: {
        query_date: new Date().toISOString(),
        total_reflections_searched: data.length,
        auth_related_found: authRelatedReflections.length,
        database: supabaseUrl,
        table: 'reflections'
      },
      reflections: authRelatedReflections.map(r => ({
        id: r.id,
        created_at: r.created_at,
        org: r.org,
        focus_area: r.focus_area,
        cohort_id: r.cohort_id,
        reflection_status: r.reflection_status,
        total_issues: r.total_issues,
        outcome: r.outcome,
        user_email: r.user_email,
        duration_minutes: r.duration_minutes,
        auth_related_issues: r.data.issues_identified.filter(issue => {
          const text = JSON.stringify(issue).toLowerCase();
          return text.includes('auth') || text.includes('permission') ||
                 text.includes('access') || text.includes('profile');
        })
      }))
    };

    const outputPath = path.join(__dirname, '../reports/auth-permissions-cohort-raw-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log(`✅ Exported ${authRelatedReflections.length} reflections to:`);
    console.log(`   ${outputPath}`);

    return output;

  } catch (err) {
    console.error('❌ Exception:', err);
    process.exit(1);
  }
}

exportAuthPermissionReflections();
