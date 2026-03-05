#!/usr/bin/env node

/**
 * Execute Reflection Status Update (Simple Version - No External Dependencies)
 * Loads environment from .env and executes update
 */

const fs = require('fs');
const path = require('path');

// Load .env file manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

envContent.split('\n').forEach(line => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;

  const [key, ...valueParts] = line.split('=');
  const value = valueParts.join('='); // Handle values with = in them

  if (key && value) {
    process.env[key] = value;
  }
});

// Now load and execute the update script
const { updateReflectionStatus } = require('./update-reflection-status.js');

async function main() {
  const reflectionId = '068c7cf7-7087-4a29-940e-ba25163505c6';
  const newStatus = 'under_review';

  console.log('Environment Configuration Check:\n');
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL || 'NOT SET'}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set (hidden)' : 'NOT SET'}`);
  console.log('');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing required environment variables!');
    process.exit(1);
  }

  try {
    const report = await updateReflectionStatus(reflectionId, newStatus, {
      reviewed_by: 'processreflections-workflow'
    });

    // Save report
    const reportsDir = path.join(__dirname, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `reflection-status-update-${timestamp}.json`;
    const filepath = path.join(reportsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`\n📄 Report saved to: ${filepath}`);
    console.log(`\n✅ Update completed successfully!\n`);

    return report;

  } catch (error) {
    console.error(`\n❌ Update failed: ${error.message}\n`);
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Execute
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
