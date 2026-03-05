#!/usr/bin/env node

/**
 * Diagnose /reflect Command Issues
 *
 * Checks:
 * 1. Was the reflection JSON file created?
 * 2. Can we reach Supabase?
 * 3. Are environment variables set correctly?
 * 4. Can we query existing reflections?
 *
 * Usage: node diagnose-reflect.js [path-to-project]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, symbol, message) {
  console.log(`${COLORS[color]}${symbol}${COLORS.reset} ${message}`);
}

function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 5000
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          data: data,
          headers: res.headers
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function diagnose(projectPath) {
  console.log('\n🔍 Diagnosing /reflect Command\n');
  console.log('='.repeat(60));

  const claudeDir = path.join(projectPath, '.claude');
  let hasIssues = false;

  // Check 1: Does .claude directory exist?
  console.log('\n📁 Step 1: Check Project Structure');
  if (!fs.existsSync(claudeDir)) {
    log('red', '❌', `.claude directory not found at: ${claudeDir}`);
    log('yellow', '⚠️', ' The /reflect command should create this automatically');
    hasIssues = true;
  } else {
    log('green', '✓', `.claude directory exists`);
  }

  // Check 2: Look for SESSION_REFLECTION files
  console.log('\n📄 Step 2: Check for Reflection Files');
  const reflectionFiles = fs.existsSync(claudeDir)
    ? fs.readdirSync(claudeDir)
        .filter(f => f.startsWith('SESSION_REFLECTION_') && f.endsWith('.json'))
        .sort()
        .reverse()
    : [];

  if (reflectionFiles.length === 0) {
    log('red', '❌', 'No SESSION_REFLECTION_*.json files found');
    log('yellow', '⚠️', ' This means the /reflect command did not generate output');
    log('blue', 'ℹ️', ' Check if the command is still running or if it errored');
    hasIssues = true;
  } else {
    log('green', '✓', `Found ${reflectionFiles.length} reflection file(s):`);
    reflectionFiles.slice(0, 3).forEach(f => {
      const filePath = path.join(claudeDir, f);
      const stats = fs.statSync(filePath);
      const size = (stats.size / 1024).toFixed(1);
      const age = Math.round((Date.now() - stats.mtimeMs) / 60000);
      console.log(`     ${f} (${size} KB, ${age} min ago)`);
    });

    // Check if most recent file is valid JSON
    const mostRecent = path.join(claudeDir, reflectionFiles[0]);
    try {
      const content = fs.readFileSync(mostRecent, 'utf-8');
      const json = JSON.parse(content);

      if (!json.issues && !json.issues_identified) {
        log('yellow', '⚠️', ' Reflection JSON missing "issues" field - may be incomplete');
      } else {
        log('green', '✓', ` Valid reflection JSON with ${(json.issues || json.issues_identified || []).length} issues`);
      }
    } catch (err) {
      log('red', '❌', ` Cannot parse JSON: ${err.message}`);
      hasIssues = true;
    }
  }

  // Check 3: Environment variables
  console.log('\n🔑 Step 3: Check Environment Variables');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const userEmail = process.env.USER_EMAIL;

  if (!supabaseUrl) {
    log('yellow', '⚠️', ' SUPABASE_URL not set (will use default)');
  } else {
    log('green', '✓', ` SUPABASE_URL: ${supabaseUrl}`);
  }

  if (!supabaseAnonKey) {
    log('yellow', '⚠️', ' SUPABASE_ANON_KEY not set (will use default)');
  } else {
    const keyPreview = supabaseAnonKey.substring(0, 15) + '...';
    log('green', '✓', ` SUPABASE_ANON_KEY: ${keyPreview}`);
  }

  if (!userEmail) {
    log('blue', 'ℹ️', ' USER_EMAIL not set (reflections will be anonymous)');
  } else {
    log('green', '✓', ` USER_EMAIL: ${userEmail}`);
  }

  // Check 4: Test Supabase connectivity
  console.log('\n🌐 Step 4: Test Supabase Connection');

  const testUrl = supabaseUrl || 'https://REDACTED_SUPABASE_PROJECT.supabase.co';
  const testKey = supabaseAnonKey || 'REDACTED_SUPABASE_ANON_KEY';

  try {
    log('blue', '⏳', ' Testing connection to Supabase...');

    const response = await makeRequest(
      `${testUrl}/rest/v1/reflections?limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': testKey,
          'Authorization': `Bearer ${testKey}`
        }
      }
    );

    if (response.ok) {
      log('green', '✓', ' Supabase connection successful');
      try {
        const data = JSON.parse(response.data);
        if (Array.isArray(data)) {
          log('green', '✓', ` Query returned ${data.length} reflection(s)`);
        }
      } catch (e) {
        log('yellow', '⚠️', ' Connection OK but unexpected response format');
      }
    } else {
      log('red', '❌', ` Supabase returned HTTP ${response.status}`);
      log('yellow', '⚠️', ` Response: ${response.data.substring(0, 200)}`);
      hasIssues = true;
    }
  } catch (err) {
    log('red', '❌', ` Cannot reach Supabase: ${err.message}`);
    log('yellow', '⚠️', ' Check your internet connection');
    hasIssues = true;
  }

  // Check 5: Test reflection query
  console.log('\n📊 Step 5: Query Recent Reflections');

  try {
    const response = await makeRequest(
      `${testUrl}/rest/v1/reflections?order=created_at.desc&limit=5`,
      {
        method: 'GET',
        headers: {
          'apikey': testKey,
          'Authorization': `Bearer ${testKey}`
        }
      }
    );

    if (response.ok) {
      const reflections = JSON.parse(response.data);
      if (reflections.length === 0) {
        log('yellow', '⚠️', ' No reflections found in database');
        log('blue', 'ℹ️', ' Your reflection may not have been submitted yet');
      } else {
        log('green', '✓', ` Found ${reflections.length} recent reflection(s):`);
        reflections.slice(0, 3).forEach(r => {
          const org = r.org || 'unknown';
          const issues = r.total_issues || 0;
          const created = new Date(r.created_at).toLocaleString();
          console.log(`     • Org: ${org}, Issues: ${issues}, Created: ${created}`);
        });
      }
    } else {
      log('red', '❌', ' Cannot query reflections');
      hasIssues = true;
    }
  } catch (err) {
    log('red', '❌', ` Query failed: ${err.message}`);
    hasIssues = true;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (hasIssues) {
    console.log('\n❌ Issues Found\n');
    console.log('Likely causes:');
    console.log('  1. /reflect command is still running (check for "No response requested" message)');
    console.log('  2. Reflection JSON was not generated (command failed silently)');
    console.log('  3. Post-reflect hook did not run (check .claude-plugins/salesforce-plugin/hooks/)');
    console.log('  4. Network connectivity to Supabase');
    console.log('\nTroubleshooting:');
    console.log('  • Wait for /reflect to complete (can take 1-2 minutes)');
    console.log('  • Check for SESSION_REFLECTION_*.json in .claude/ directory');
    console.log('  • Manually submit: node .claude-plugins/salesforce-plugin/scripts/lib/submit-reflection.js .claude/SESSION_REFLECTION_*.json');
    console.log('  • Check hook output in terminal');
  } else {
    console.log('\n✅ All checks passed!\n');
    console.log('If your reflection still isn\'t showing:');
    console.log('  • Wait a few more minutes for /reflect to complete');
    console.log('  • Refresh Supabase dashboard');
    console.log('  • Run: node .claude-plugins/salesforce-plugin/scripts/lib/query-reflections.js recent');
  }

  console.log('');
}

// CLI
const projectPath = process.argv[2] || process.cwd();

diagnose(projectPath).catch(err => {
  console.error('❌ Diagnostic failed:', err.message);
  process.exit(1);
});
