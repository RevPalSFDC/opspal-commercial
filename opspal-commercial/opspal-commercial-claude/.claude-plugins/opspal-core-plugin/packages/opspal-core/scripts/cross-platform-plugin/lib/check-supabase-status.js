#!/usr/bin/env node
/**
 * check-supabase-status.js
 *
 * Helper script to check Supabase database connectivity and skills_registry status.
 * Used by plugin-update-manager.js to avoid REST API schema cache issues.
 *
 * Output: JSON object with { connected: boolean, count?: number, error?: string }
 */

require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');

async function checkSupabaseStatus() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log(JSON.stringify({ connected: false, error: 'Credentials not configured' }));
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Test connection and get skills count (table is named 'skills', not 'skills_registry')
    const { data, error, count } = await supabase
      .from('skills')
      .select('skill_id', { count: 'exact', head: false })
      .limit(1);

    if (error) {
      console.log(JSON.stringify({ connected: false, error: error.message }));
    } else {
      console.log(JSON.stringify({ connected: true, count: count || 0 }));
    }
  } catch (e) {
    console.log(JSON.stringify({ connected: false, error: e.message }));
  }
}

checkSupabaseStatus();
