#!/usr/bin/env node

/**
 * Execute Reflection Status Update
 * Wrapper script to load environment and execute update
 */

// Load environment from .env file
require('dotenv').config({ path: __dirname + '/.env' });

const { updateReflectionStatus } = require('./update-reflection-status.js');

async function main() {
  const reflectionId = '068c7cf7-7087-4a29-940e-ba25163505c6';
  const newStatus = 'under_review';

  console.log('Starting reflection update...\n');
  console.log(`Environment check:`);
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL ? 'Set' : 'MISSING'}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'MISSING'}`);
  console.log('');

  try {
    const report = await updateReflectionStatus(reflectionId, newStatus, {
      reviewed_by: 'processreflections-workflow'
    });

    // Save report
    const fs = require('fs');
    const path = require('path');

    const reportsDir = path.join(__dirname, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `reflection-status-update-${timestamp}.json`;
    const filepath = path.join(reportsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`\n✅ SUCCESS!`);
    console.log(`\nReport saved to: ${filepath}`);

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ FAILED: ${error.message}`);
    console.error(`\nStack trace:`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
