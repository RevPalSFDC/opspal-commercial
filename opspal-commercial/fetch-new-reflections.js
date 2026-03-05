#!/usr/bin/env node

/**
 * Fetch all reflections with status='new' from Supabase
 * Extract full data including issues_identified arrays
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://REDACTED_SUPABASE_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'REDACTED_SUPABASE_ANON_KEY';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

function getCliFlags(argv = []) {
  const flags = new Set(argv);
  return {
    includeEmails: flags.has('--include-emails'),
    printJson: flags.has('--print-json')
  };
}

function maskEmail(email, opts = {}) {
  if (!email) return null;
  if (opts.includeEmails) return email;

  const [local, domain] = email.split('@');
  if (!domain) return 'redacted';
  if (!local) return `***@${domain}`;

  return `${local[0]}***@${domain}`;
}

// Make HTTP request to Supabase
function querySupabase(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}?${queryString}`;

    const options = {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });
}

async function main() {
  const { includeEmails, printJson } = getCliFlags(process.argv.slice(2));

  console.log('🔍 Querying reflections with status=\'new\'...\n');

  try {
    // Query reflections with status='new'
    const reflections = await querySupabase('reflections', {
      'reflection_status': 'eq.new',
      'select': '*',
      'order': 'created_at.desc'
    });

    console.log(`✅ Found ${reflections.length} reflections with status='new'\n`);

    // Transform data to extract key fields and mask PII
    const transformedReflections = reflections.map(r => {
      const data = r.data || {};
      return {
        id: r.id,
        org: r.org,
        created_at: r.created_at,
        focus_area: r.focus_area,
        issues_identified: data.issues_identified || [],
        total_issues: r.total_issues,
        roi_annual_value: r.roi_annual_value,
        duration_minutes: r.duration_minutes,
        plugin_info: {
          name: r.plugin_name,
          version: r.plugin_version
        },
        reflection_status: r.reflection_status,
        user_email: maskEmail(r.user_email, { includeEmails }),
        outcome: r.outcome
      };
    });

    const result = {
      total_reflections: reflections.length,
      query_timestamp: new Date().toISOString(),
      reflections: transformedReflections
    };

    // Ensure reports directory exists
    const reportsDir = path.join(__dirname, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputPath = path.join(reportsDir, `reflections-raw-${timestamp}.json`);

    // Write to file
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`📄 Results saved to: ${outputPath}\n`);
    console.log('📊 Summary:');
    console.log(`   Total reflections: ${result.total_reflections}`);
    console.log(`   Total issues across all reflections: ${transformedReflections.reduce((sum, r) => sum + r.total_issues, 0)}`);
    console.log(`   Orgs: ${[...new Set(reflections.map(r => r.org))].join(', ')}`);
    console.log(`   Focus areas: ${[...new Set(reflections.map(r => r.focus_area))].join(', ')}`);

    if (printJson) {
      console.log('\n' + JSON.stringify(result, null, 2));
    } else {
      console.log('\n(use --print-json to emit the redacted payload to stdout)');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { maskEmail, getCliFlags };
