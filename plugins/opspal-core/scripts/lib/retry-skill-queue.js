#!/usr/bin/env node

/**
 * Retry Skill Queue Processor
 *
 * Processes queued skill executions when Supabase connectivity is restored.
 * Queue file: ~/.claude/skill-execution-queue.jsonl
 *
 * Usage:
 *   node retry-skill-queue.js [--dry-run] [--verbose]
 *
 * Options:
 *   --dry-run    Show what would be processed without actually processing
 *   --verbose    Show detailed processing information
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const QUEUE_FILE = path.join(process.env.HOME, '.claude/skill-execution-queue.jsonl');
const TEMP_QUEUE = QUEUE_FILE + '.processing';
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../..');
const STRATEGY_REGISTRY = path.join(PLUGIN_ROOT, 'scripts/lib/strategy-registry.js');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose') || process.env.ROUTING_VERBOSE === '1';

/**
 * Log message with optional verbose filtering
 */
function log(level, message) {
  if (level === 'ERROR' || VERBOSE) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${level}] ${message}`);
  }
}

/**
 * Check if Supabase is configured and reachable
 */
async function checkSupabaseConnectivity() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    log('WARN', 'Supabase not configured - skipping retry');
    return false;
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(2000)
    });

    const isReachable = response.ok || response.status === 404; // 404 is ok, means API is up
    log('INFO', `Supabase connectivity: ${isReachable ? 'available' : 'unavailable'}`);
    return isReachable;
  } catch (err) {
    log('WARN', `Supabase unreachable: ${err.message}`);
    return false;
  }
}

/**
 * Record a single skill execution via strategy-registry.js
 */
function recordSkillExecution(record) {
  return new Promise((resolve, reject) => {
    const args = [
      STRATEGY_REGISTRY,
      'record',
      '--skill-id', record.skill_id,
      '--agent', record.agent || 'unknown',
      '--success', String(record.success || false),
      '--session-id', record.session_id || 'unknown'
    ];

    if (record.org) {
      args.push('--org-alias', record.org);
    }

    log('INFO', `Recording: ${record.skill_id} (agent: ${record.agent}, success: ${record.success})`);

    const proc = spawn('node', args, {
      stdio: VERBOSE ? 'inherit' : 'pipe'
    });

    proc.on('close', (code) => {
      if (code === 0) {
        log('INFO', `Successfully recorded: ${record.skill_id}`);
        resolve(record);
      } else {
        log('ERROR', `Failed to record: ${record.skill_id} (exit code ${code})`);
        reject(new Error(`Exit code ${code}`));
      }
    });

    proc.on('error', (err) => {
      log('ERROR', `Process error for ${record.skill_id}: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Process the queue file
 */
async function processQueue() {
  // Check if queue file exists
  if (!fs.existsSync(QUEUE_FILE)) {
    log('INFO', 'No queue file found - nothing to retry');
    return {
      total: 0,
      processed: 0,
      failed: 0,
      skipped: 0
    };
  }

  // Check Supabase connectivity
  const supabaseAvailable = await checkSupabaseConnectivity();
  if (!supabaseAvailable) {
    log('WARN', 'Supabase unavailable - skipping retry (queue preserved)');
    return {
      total: 0,
      processed: 0,
      failed: 0,
      skipped: 0
    };
  }

  // Read queue file
  const content = fs.readFileSync(QUEUE_FILE, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    log('INFO', 'Queue file is empty');
    // Remove empty queue file
    if (!DRY_RUN) {
      fs.unlinkSync(QUEUE_FILE);
    }
    return {
      total: 0,
      processed: 0,
      failed: 0,
      skipped: 0
    };
  }

  log('INFO', `Processing ${lines.length} queued skill execution(s)`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would process the following records:\n');
    lines.forEach((line, i) => {
      try {
        const record = JSON.parse(line);
        console.log(`  ${i + 1}. ${record.skill_id} (agent: ${record.agent}, success: ${record.success})`);
      } catch (err) {
        console.log(`  ${i + 1}. [INVALID JSON]`);
      }
    });
    console.log();
    return {
      total: lines.length,
      processed: 0,
      failed: 0,
      skipped: lines.length
    };
  }

  // Process each record
  const results = {
    total: lines.length,
    processed: 0,
    failed: 0,
    skipped: 0
  };

  const failedRecords = [];

  for (const line of lines) {
    try {
      const record = JSON.parse(line);

      // Try to process
      await recordSkillExecution(record);
      results.processed++;

    } catch (err) {
      log('ERROR', `Failed to process record: ${err.message}`);
      results.failed++;
      // Keep failed record for re-queueing
      failedRecords.push(line);
    }
  }

  // Update queue file with only failed records
  if (failedRecords.length > 0) {
    fs.writeFileSync(QUEUE_FILE, failedRecords.join('\n') + '\n', 'utf8');
    log('WARN', `${failedRecords.length} record(s) failed, preserved in queue for retry`);
  } else {
    // All processed successfully, remove queue file
    fs.unlinkSync(QUEUE_FILE);
    log('INFO', 'All records processed successfully, queue file removed');
  }

  return results;
}

/**
 * Main entry point
 */
async function main() {
  try {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  Retry Skill Queue Processor                           ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    if (DRY_RUN) {
      console.log('[DRY RUN MODE] - No changes will be made\n');
    }

    const results = await processQueue();

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  Processing Summary                                    ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    console.log(`  Total records:     ${results.total}`);
    console.log(`  Processed:         ${results.processed}`);
    console.log(`  Failed:            ${results.failed}`);
    console.log(`  Skipped:           ${results.skipped}`);
    console.log();

    if (results.failed > 0) {
      console.log('⚠️  Some records failed to process and have been preserved in the queue.');
      console.log('   Run this script again later to retry.\n');
      process.exit(1);
    } else if (results.processed > 0) {
      console.log('✅ All records processed successfully!\n');
    }

    process.exit(0);

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    if (VERBOSE) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { processQueue, checkSupabaseConnectivity };
