#!/usr/bin/env node

/**
 * Copyright 2024-2026 RevPal Corp.
 *
 * Test Supabase Connection
 *
 * Verifies Supabase credentials and connection to reflections table.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment configuration
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testConnection() {
  console.log('🔍 Testing Supabase Connection\n');

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  console.log('📋 Configuration Check:');
  console.log(`   SUPABASE_URL: ${supabaseUrl ? '✓ Set' : '✗ Missing'}`);
  console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${serviceRoleKey ? '✓ Set' : '✗ Missing'}`);
  console.log(`   SUPABASE_ANON_KEY: ${anonKey ? '✓ Set' : '⚠ Optional'}\n`);

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing required credentials\n');
    console.error('Create .env file with:');
    console.error('  SUPABASE_URL=https://your-project-id.supabase.co');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...\n');
    process.exit(1);
  }

  // Test connection with service role key
  console.log('🔌 Testing Connection (Service Role)...');
  const supabaseService = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data, error, count } = await supabaseService
      .from('reflections')
      .select('*', { count: 'exact', head: false })
      .limit(1);

    if (error) {
      console.error(`   ✗ Connection failed: ${error.message}`);
      console.error(`   Error details: ${JSON.stringify(error, null, 2)}\n`);
      process.exit(1);
    }

    console.log(`   ✓ Connected successfully`);
    console.log(`   Total reflections in table: ${count}\n`);

    // Check for 'new' status reflections
    const { data: newReflections, error: newError, count: newCount } = await supabaseService
      .from('reflections')
      .select('*', { count: 'exact', head: true })
      .eq('reflection_status', 'new');

    if (newError) {
      console.error(`   ⚠ Warning: Could not count 'new' reflections: ${newError.message}\n`);
    } else {
      console.log(`📊 Reflection Status Breakdown:`);
      console.log(`   Reflections with status='new': ${newCount}`);

      if (newCount === 0) {
        console.log(`   ⚠ No reflections with status='new' found`);
        console.log(`   Phase 1 will have nothing to process\n`);
      } else {
        console.log(`   ✓ Ready to process ${newCount} reflections\n`);
      }
    }

    // Test anon key if provided
    if (anonKey) {
      console.log('🔌 Testing Connection (Anon Key)...');
      const supabaseAnon = createClient(supabaseUrl, anonKey);

      const { data: anonData, error: anonError } = await supabaseAnon
        .from('reflections')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      if (anonError) {
        console.log(`   ⚠ Anon key test failed: ${anonError.message}`);
        console.log(`   This is OK - anon key is read-only\n`);
      } else {
        console.log(`   ✓ Anon key can read reflections\n`);
      }
    }

    console.log('✅ Supabase connection verified\n');
    console.log('Next steps:');
    console.log('  node scripts/process-reflections-phase1.js\n');

  } catch (error) {
    console.error(`❌ Unexpected error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Execute test
testConnection();
