/**
 * Process Lock Manager
 *
 * Prevents concurrent execution of identical scripts using PID-based file locking.
 * Includes automatic stale lock cleanup and graceful failure handling.
 *
 * Features:
 * - PID-based locking with automatic stale detection
 * - Lock metadata (script name, arguments, started_at)
 * - Graceful lock acquisition with retry mechanism
 * - Manual lock release utility
 * - Health check for hung processes
 *
 * @module process-lock-manager
 * @version 1.0.0
 * @created 2025-10-14
 * @fixes Reflection Cohort fp-002-process-management
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG = {
  lockDir: './.locks',              // Directory for lock files
  staleThresholdMs: 3600000,        // 1 hour - locks older than this are stale
  maxRetries: 3,                    // Retry attempts if lock is held
  retryDelayMs: 5000,               // Wait 5 seconds between retries
  verbose: true
};

// =============================================================================
// Lock Metadata
// =============================================================================

class LockMetadata {
  constructor(scriptName, args = []) {
    this.pid = process.pid;
    this.scriptName = scriptName;
    this.args = args;
    this.startedAt = new Date().toISOString();
    this.hostname = require('os').hostname();
  }

  toJSON() {
    return {
      pid: this.pid,
      scriptName: this.scriptName,
      args: this.args,
      startedAt: this.startedAt,
      hostname: this.hostname
    };
  }

  static fromJSON(json) {
    const metadata = new LockMetadata(json.scriptName, json.args);
    metadata.pid = json.pid;
    metadata.startedAt = json.startedAt;
    metadata.hostname = json.hostname;
    return metadata;
  }
}

// =============================================================================
// Process Utilities
// =============================================================================

/**
 * Check if a process is still running
 *
 * @param {number} pid - Process ID to check
 * @returns {boolean} True if process is running
 */
function isProcessRunning(pid) {
  try {
    // On Unix-like systems, signal 0 doesn't kill, just checks existence
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get process command line
 *
 * @param {number} pid - Process ID
 * @returns {string|null} Command line or null if not found
 */
function getProcessCommand(pid) {
  try {
    const cmd = process.platform === 'win32'
      ? `wmic process where processid=${pid} get commandline`
      : `ps -p ${pid} -o command=`;

    const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return output.trim();
  } catch (error) {
    return null;
  }
}

// =============================================================================
// Lock File Management
// =============================================================================

/**
 * Generate lock file path for a script
 *
 * @param {string} scriptName - Name of the script
 * @param {string} lockDir - Lock directory
 * @returns {string} Path to lock file
 */
function getLockFilePath(scriptName, lockDir) {
  const safeName = scriptName.replace(/[^a-z0-9_-]/gi, '_');
  return path.join(lockDir, `${safeName}.lock`);
}

/**
 * Check if lock file is stale
 *
 * @param {string} lockFilePath - Path to lock file
 * @param {number} staleThresholdMs - Threshold in milliseconds
 * @returns {{isStale: boolean, ageMs: number, metadata: LockMetadata}}
 */
function checkLockStaleness(lockFilePath, staleThresholdMs) {
  if (!fs.existsSync(lockFilePath)) {
    return { isStale: false, ageMs: 0, metadata: null };
  }

  try {
    const lockData = JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
    const metadata = LockMetadata.fromJSON(lockData);

    const startedAt = new Date(metadata.startedAt);
    const now = new Date();
    const ageMs = now - startedAt;

    // Check if process is still running
    const processRunning = isProcessRunning(metadata.pid);

    // Lock is stale if process is dead OR age exceeds threshold
    const isStale = !processRunning || ageMs > staleThresholdMs;

    return {
      isStale,
      ageMs,
      metadata,
      processRunning
    };
  } catch (error) {
    // If we can't read lock file, consider it stale
    return { isStale: true, ageMs: 0, metadata: null };
  }
}

/**
 * Clean up stale lock file
 *
 * @param {string} lockFilePath - Path to lock file
 * @param {boolean} verbose - Log cleanup action
 */
function cleanupStaleLock(lockFilePath, verbose = false) {
  if (fs.existsSync(lockFilePath)) {
    fs.unlinkSync(lockFilePath);

    if (verbose) {
      console.log(`🧹 Cleaned up stale lock: ${lockFilePath}`);
    }
  }
}

// =============================================================================
// Lock Acquisition
// =============================================================================

/**
 * Acquire lock for a script
 *
 * @param {Object} options
 * @param {string} options.scriptName - Name of the script to lock
 * @param {Array<string>} [options.args=[]] - Script arguments (for identification)
 * @param {string} [options.lockDir] - Lock directory
 * @param {number} [options.staleThresholdMs] - Stale lock threshold
 * @param {number} [options.maxRetries] - Max retry attempts
 * @param {number} [options.retryDelayMs] - Delay between retries
 * @param {boolean} [options.verbose=true] - Log actions
 * @returns {Promise<{acquired: boolean, lockFile: string, metadata: LockMetadata}>}
 *
 * @example
 * const lock = await acquireLock({
 *   scriptName: 'query_all_parent_accounts.js',
 *   args: ['--org', 'production']
 * });
 *
 * if (!lock.acquired) {
 *   console.error('Script is already running');
 *   process.exit(1);
 * }
 *
 * try {
 *   // Do work
 * } finally {
 *   await releaseLock(lock.lockFile);
 * }
 */
async function acquireLock(options) {
  const {
    scriptName,
    args = [],
    lockDir = DEFAULT_CONFIG.lockDir,
    staleThresholdMs = DEFAULT_CONFIG.staleThresholdMs,
    maxRetries = DEFAULT_CONFIG.maxRetries,
    retryDelayMs = DEFAULT_CONFIG.retryDelayMs,
    verbose = DEFAULT_CONFIG.verbose
  } = options;

  // Ensure lock directory exists
  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true });
  }

  const lockFilePath = getLockFilePath(scriptName, lockDir);
  const metadata = new LockMetadata(scriptName, args);

  if (verbose) {
    console.log(`\n🔒 Acquiring lock for: ${scriptName}`);
    console.log(`   Lock file: ${lockFilePath}`);
    console.log(`   PID: ${metadata.pid}`);
  }

  let retries = 0;

  while (retries <= maxRetries) {
    // Check if lock exists
    if (fs.existsSync(lockFilePath)) {
      const staleness = checkLockStaleness(lockFilePath, staleThresholdMs);

      if (staleness.isStale) {
        // Clean up stale lock
        if (verbose) {
          console.log(`   ⚠️  Found stale lock (age: ${(staleness.ageMs / 1000 / 60).toFixed(1)} min, process running: ${staleness.processRunning})`);
        }

        cleanupStaleLock(lockFilePath, verbose);
        // Continue to acquire lock
      } else {
        // Lock is held by active process
        if (verbose) {
          console.log(`   ❌ Lock held by PID ${staleness.metadata.pid} (age: ${(staleness.ageMs / 1000 / 60).toFixed(1)} min)`);
          console.log(`   Script: ${staleness.metadata.scriptName}`);
          console.log(`   Started: ${staleness.metadata.startedAt}`);
        }

        if (retries < maxRetries) {
          if (verbose) {
            console.log(`   ⏳ Retrying in ${retryDelayMs / 1000} seconds (${retries + 1}/${maxRetries})...`);
          }

          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          retries++;
          continue;
        } else {
          if (verbose) {
            console.log(`   ❌ Max retries reached - lock acquisition failed`);
          }

          return {
            acquired: false,
            lockFile: lockFilePath,
            metadata: staleness.metadata
          };
        }
      }
    }

    // Acquire lock
    try {
      fs.writeFileSync(lockFilePath, JSON.stringify(metadata.toJSON(), null, 2), { flag: 'wx' });

      if (verbose) {
        console.log(`   ✅ Lock acquired successfully`);
      }

      return {
        acquired: true,
        lockFile: lockFilePath,
        metadata: metadata
      };
    } catch (error) {
      if (error.code === 'EEXIST') {
        // Another process acquired lock between our check and write
        if (verbose) {
          console.log(`   ⚠️  Race condition detected, retrying...`);
        }

        retries++;
        await new Promise(resolve => setTimeout(resolve, 500)); // Short delay
        continue;
      }

      throw error;
    }
  }

  return {
    acquired: false,
    lockFile: lockFilePath,
    metadata: null
  };
}

/**
 * Release lock for a script
 *
 * @param {string} lockFilePath - Path to lock file
 * @param {boolean} verbose - Log release action
 */
async function releaseLock(lockFilePath, verbose = false) {
  if (fs.existsSync(lockFilePath)) {
    fs.unlinkSync(lockFilePath);

    if (verbose) {
      console.log(`\n🔓 Lock released: ${lockFilePath}`);
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * List all active locks
 *
 * @param {string} lockDir - Lock directory
 * @returns {Array<{lockFile: string, metadata: LockMetadata, staleness: Object}>}
 */
function listActiveLocks(lockDir = DEFAULT_CONFIG.lockDir) {
  if (!fs.existsSync(lockDir)) {
    return [];
  }

  const lockFiles = fs.readdirSync(lockDir).filter(f => f.endsWith('.lock'));
  const locks = [];

  for (const lockFile of lockFiles) {
    const lockFilePath = path.join(lockDir, lockFile);
    const staleness = checkLockStaleness(lockFilePath, DEFAULT_CONFIG.staleThresholdMs);

    if (staleness.metadata) {
      locks.push({
        lockFile: lockFilePath,
        metadata: staleness.metadata,
        staleness
      });
    }
  }

  return locks;
}

/**
 * Force release a lock (use with caution)
 *
 * @param {string} scriptName - Script name
 * @param {string} lockDir - Lock directory
 * @param {boolean} verbose - Log action
 */
function forceReleaseLock(scriptName, lockDir = DEFAULT_CONFIG.lockDir, verbose = false) {
  const lockFilePath = getLockFilePath(scriptName, lockDir);

  if (fs.existsSync(lockFilePath)) {
    fs.unlinkSync(lockFilePath);

    if (verbose) {
      console.log(`⚠️  Force released lock: ${lockFilePath}`);
    }

    return true;
  }

  return false;
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  const command = process.argv[2];

  if (!command) {
    console.log('Usage: node process-lock-manager.js <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  list              List all active locks');
    console.log('  release <script>  Force release a lock');
    console.log('  cleanup           Clean up all stale locks');
    console.log('');
    process.exit(1);
  }

  switch (command) {
    case 'list': {
      const locks = listActiveLocks();

      console.log(`\n📋 Active Locks: ${locks.length}\n`);

      if (locks.length === 0) {
        console.log('No active locks found.');
      } else {
        locks.forEach((lock, i) => {
          console.log(`${i + 1}. ${lock.metadata.scriptName}`);
          console.log(`   PID: ${lock.metadata.pid} (${lock.staleness.processRunning ? 'running' : 'NOT RUNNING'})`);
          console.log(`   Started: ${lock.metadata.startedAt}`);
          console.log(`   Age: ${(lock.staleness.ageMs / 1000 / 60).toFixed(1)} minutes`);
          console.log(`   ${lock.staleness.isStale ? '⚠️  STALE' : '✅ Active'}`);
          console.log('');
        });
      }
      break;
    }

    case 'release': {
      const scriptName = process.argv[3];

      if (!scriptName) {
        console.error('❌ Usage: node process-lock-manager.js release <script-name>');
        process.exit(1);
      }

      const released = forceReleaseLock(scriptName, DEFAULT_CONFIG.lockDir, true);

      if (!released) {
        console.log(`No lock found for: ${scriptName}`);
      }
      break;
    }

    case 'cleanup': {
      const locks = listActiveLocks();
      let cleaned = 0;

      console.log(`\n🧹 Cleaning up stale locks...\n`);

      for (const lock of locks) {
        if (lock.staleness.isStale) {
          cleanupStaleLock(lock.lockFile, true);
          cleaned++;
        }
      }

      console.log(`\n✅ Cleaned up ${cleaned} stale lock(s)`);
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  acquireLock,
  releaseLock,
  listActiveLocks,
  forceReleaseLock,
  isProcessRunning,
  checkLockStaleness,
  LockMetadata
};
