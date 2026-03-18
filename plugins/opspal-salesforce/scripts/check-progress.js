#!/usr/bin/env node

/**
 * Check Progress CLI Utility
 *
 * User-friendly command-line tool for monitoring long-running Salesforce operations.
 * Provides real-time progress updates without needing to check log files.
 *
 * Usage:
 *   node check-progress.js [script-name]  - Show progress for specific script or all
 *   node check-progress.js --watch        - Continuous monitoring mode
 *   node check-progress.js --list         - List all active operations
 *
 * @version 1.0.0
 * @created 2025-10-14
 * @fixes Reflection Cohort fp-002-process-management
 */

const { listAllProgress, getProgress } = require('./lib/progress-file-writer');
const { isProcessRunning } = require('./lib/process-lock-manager');

// =============================================================================
// Configuration
// =============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const WATCH_INTERVAL_MS = 2000; // Refresh every 2 seconds in watch mode

// =============================================================================
// Display Functions
// =============================================================================

/**
 * Format elapsed time in human-readable format
 *
 * @param {Date} startTime - Start time
 * @returns {string} Formatted elapsed time
 */
function formatElapsed(startTime) {
  const elapsed = Date.now() - new Date(startTime).getTime();
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format ETA in human-readable format
 *
 * @param {string} etaISO - ISO timestamp of ETA
 * @returns {string} Formatted ETA
 */
function formatETA(etaISO) {
  const eta = new Date(etaISO);
  const now = new Date();
  const diff = eta - now;

  if (diff < 0) {
    return 'Overdue';
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `~${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `~${minutes}m`;
  } else {
    return `~${seconds}s`;
  }
}

/**
 * Get status color
 *
 * @param {string} status - Progress status
 * @returns {string} ANSI color code
 */
function getStatusColor(status) {
  switch (status) {
    case 'completed':
      return COLORS.green;
    case 'failed':
      return COLORS.red;
    case 'in_progress':
      return COLORS.yellow;
    case 'starting':
      return COLORS.cyan;
    default:
      return COLORS.reset;
  }
}

/**
 * Draw progress bar
 *
 * @param {number} percentage - Progress percentage (0-100)
 * @param {number} width - Width of progress bar
 * @returns {string} ASCII progress bar
 */
function drawProgressBar(percentage, width = 30) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const color = percentage < 50 ? COLORS.yellow : percentage < 100 ? COLORS.cyan : COLORS.green;

  return `${color}[${bar}]${COLORS.reset} ${percentage}%`;
}

/**
 * Display progress for a single operation
 *
 * @param {ProgressState} state - Progress state
 * @param {boolean} detailed - Show detailed information
 */
function displayProgress(state, detailed = false) {
  const statusColor = getStatusColor(state.status);
  const processRunning = isProcessRunning(state.pid);

  console.log(`\n${COLORS.bright}${state.scriptName}${COLORS.reset}`);
  console.log(`${statusColor}● ${state.status.toUpperCase()}${COLORS.reset} ${processRunning ? '(PID: ' + state.pid + ')' : '(Process not running)'}`);
  console.log('');

  // Progress bar
  if (state.status === 'in_progress' || state.status === 'completing') {
    console.log(`Progress: ${drawProgressBar(state.percentage)}`);
    console.log(`Step: ${state.currentStep} / ${state.totalSteps}`);
  }

  // Message
  console.log(`Message: ${state.message}`);

  // Timing
  console.log(`Elapsed: ${formatElapsed(state.startedAt)}`);

  if (state.estimatedCompletion) {
    console.log(`ETA: ${formatETA(state.estimatedCompletion)}`);
  }

  // Detailed info
  if (detailed) {
    console.log('');
    console.log(`${COLORS.dim}Started: ${new Date(state.startedAt).toLocaleString()}${COLORS.reset}`);
    console.log(`${COLORS.dim}Updated: ${new Date(state.updatedAt).toLocaleString()}${COLORS.reset}`);

    if (Object.keys(state.metadata).length > 0) {
      console.log('');
      console.log('Metadata:');
      Object.entries(state.metadata).forEach(([key, value]) => {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      });
    }
  }
}

/**
 * Display all active operations
 *
 * @param {Array<ProgressState>} allProgress - All progress states
 * @param {boolean} detailed - Show detailed information
 */
function displayAllProgress(allProgress, detailed = false) {
  if (allProgress.length === 0) {
    console.log('\n📭 No active operations');
    console.log('');
    return;
  }

  console.log(`\n📊 Active Operations: ${allProgress.length}`);

  allProgress.forEach(state => {
    displayProgress(state, detailed);
  });

  console.log('');
}

// =============================================================================
// Watch Mode
// =============================================================================

/**
 * Watch mode - continuously update display
 *
 * @param {string|null} scriptName - Script to watch, or null for all
 */
async function watchMode(scriptName = null) {
  // Clear screen
  console.clear();

  // Display header
  console.log(`${COLORS.bright}═══════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bright}  Progress Monitor${scriptName ? ` - ${scriptName}` : ' - All Operations'}${COLORS.reset}`);
  console.log(`${COLORS.bright}═══════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.dim}Press Ctrl+C to exit${COLORS.reset}`);

  setInterval(() => {
    // Move cursor to top
    process.stdout.write('\x1B[4;0H');

    // Clear below cursor
    process.stdout.write('\x1B[J');

    if (scriptName) {
      const state = getProgress(scriptName);

      if (!state) {
        console.log(`\n⚠️  No progress found for: ${scriptName}`);
        console.log('   Operation may have completed or not started yet.');
      } else {
        displayProgress(state, true);
      }
    } else {
      const allProgress = listAllProgress();
      displayAllProgress(allProgress, false);
    }

    // Show timestamp
    console.log(`${COLORS.dim}Last updated: ${new Date().toLocaleTimeString()}${COLORS.reset}`);
  }, WATCH_INTERVAL_MS);
}

// =============================================================================
// Main CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // No arguments - show all active operations
  if (!command) {
    const allProgress = listAllProgress();
    displayAllProgress(allProgress, false);
    return;
  }

  // Flags
  if (command === '--watch' || command === '-w') {
    const scriptName = args[1] || null;
    await watchMode(scriptName);
    return;
  }

  if (command === '--list' || command === '-l') {
    const allProgress = listAllProgress();
    displayAllProgress(allProgress, false);
    return;
  }

  if (command === '--help' || command === '-h') {
    console.log('');
    console.log('Usage: node check-progress.js [options] [script-name]');
    console.log('');
    console.log('Options:');
    console.log('  <none>             Show all active operations');
    console.log('  <script-name>      Show progress for specific script');
    console.log('  --watch, -w        Continuous monitoring mode');
    console.log('  --list, -l         List all active operations');
    console.log('  --help, -h         Show this help');
    console.log('');
    console.log('Examples:');
    console.log('  node check-progress.js');
    console.log('  node check-progress.js query_all_parent_accounts.js');
    console.log('  node check-progress.js --watch');
    console.log('  node check-progress.js --watch query_all_parent_accounts.js');
    console.log('');
    return;
  }

  // Assume it's a script name
  const scriptName = command;
  const state = getProgress(scriptName);

  if (!state) {
    console.log(`\n⚠️  No progress found for: ${scriptName}`);
    console.log('');
    console.log('Possible reasons:');
    console.log('  - Operation has not started yet');
    console.log('  - Operation has completed and progress was cleaned up');
    console.log('  - Script name is incorrect');
    console.log('');
    console.log('Try: node check-progress.js --list');
    console.log('');
    process.exit(1);
  }

  displayProgress(state, true);
  console.log('');
}

// Run
main().catch(error => {
  console.error(`\n❌ Error: ${error.message}`);
  process.exit(1);
});
