/**
 * Progress File Framework
 *
 * Provides structured progress updates for long-running Salesforce operations.
 * Enables real-time monitoring without database dependencies.
 *
 * Features:
 * - File-based progress tracking (no database required)
 * - Standard JSON format with status, steps, percentage, ETA
 * - Atomic writes prevent corruption
 * - Auto-cleanup on completion
 * - Integration with check-progress CLI utility
 *
 * @module progress-file-writer
 * @version 1.0.0
 * @created 2025-10-14
 * @fixes Reflection Cohort fp-002-process-management
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG = {
  progressDir: './.progress',       // Directory for progress files
  cleanupOnComplete: true,           // Auto-delete on completion
  updateIntervalMs: 5000,            // Minimum time between updates
  verbose: false
};

// =============================================================================
// Progress State
// =============================================================================

const ProgressStatus = {
  STARTING: 'starting',
  IN_PROGRESS: 'in_progress',
  COMPLETING: 'completing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

class ProgressState {
  constructor(scriptName, totalSteps) {
    this.scriptName = scriptName;
    this.pid = process.pid;
    this.status = ProgressStatus.STARTING;
    this.currentStep = 0;
    this.totalSteps = totalSteps;
    this.percentage = 0;
    this.message = 'Initializing...';
    this.startedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.estimatedCompletion = null;
    this.metadata = {};
  }

  toJSON() {
    return {
      scriptName: this.scriptName,
      pid: this.pid,
      status: this.status,
      currentStep: this.currentStep,
      totalSteps: this.totalSteps,
      percentage: this.percentage,
      message: this.message,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      estimatedCompletion: this.estimatedCompletion,
      metadata: this.metadata
    };
  }

  static fromJSON(json) {
    const state = new ProgressState(json.scriptName, json.totalSteps);
    Object.assign(state, json);
    return state;
  }
}

// =============================================================================
// Progress File Management
// =============================================================================

/**
 * Get progress file path for a script
 *
 * @param {string} scriptName - Script name
 * @param {string} progressDir - Progress directory
 * @returns {string} Path to progress file
 */
function getProgressFilePath(scriptName, progressDir) {
  const safeName = scriptName.replace(/[^a-z0-9_-]/gi, '_');
  return path.join(progressDir, `${safeName}.progress.json`);
}

/**
 * Atomically write progress file
 *
 * @param {string} filePath - Progress file path
 * @param {ProgressState} state - Progress state
 */
function writeProgressFile(filePath, state) {
  const tempFile = `${filePath}.tmp`;

  // Write to temp file
  fs.writeFileSync(tempFile, JSON.stringify(state.toJSON(), null, 2));

  // Atomic rename
  fs.renameSync(tempFile, filePath);
}

/**
 * Read progress file
 *
 * @param {string} filePath - Progress file path
 * @returns {ProgressState|null} Progress state or null if not found
 */
function readProgressFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return ProgressState.fromJSON(JSON.parse(data));
  } catch (error) {
    console.warn(`⚠️  Could not read progress file: ${error.message}`);
    return null;
  }
}

/**
 * Delete progress file
 *
 * @param {string} filePath - Progress file path
 */
function deleteProgressFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// =============================================================================
// Progress Writer Class
// =============================================================================

class ProgressWriter {
  constructor(options = {}) {
    this.scriptName = options.scriptName || path.basename(process.argv[1]);
    this.totalSteps = options.totalSteps || 100;
    this.progressDir = options.progressDir || DEFAULT_CONFIG.progressDir;
    this.cleanupOnComplete = options.cleanupOnComplete !== undefined
      ? options.cleanupOnComplete
      : DEFAULT_CONFIG.cleanupOnComplete;
    this.verbose = options.verbose !== undefined
      ? options.verbose
      : DEFAULT_CONFIG.verbose;

    this.state = new ProgressState(this.scriptName, this.totalSteps);
    this.progressFilePath = getProgressFilePath(this.scriptName, this.progressDir);
    this.lastUpdateTime = 0;
    this.updateIntervalMs = options.updateIntervalMs || DEFAULT_CONFIG.updateIntervalMs;

    // Ensure progress directory exists
    if (!fs.existsSync(this.progressDir)) {
      fs.mkdirSync(this.progressDir, { recursive: true });
    }

    // Write initial state
    this.writeProgress(true); // Force initial write
  }

  /**
   * Update progress
   *
   * @param {Object} update
   * @param {number} [update.currentStep] - Current step number
   * @param {string} [update.message] - Status message
   * @param {Object} [update.metadata] - Additional metadata
   * @param {boolean} [force=false] - Force update even if interval not elapsed
   */
  update(update, force = false) {
    const now = Date.now();

    // Rate limit updates unless forced
    if (!force && (now - this.lastUpdateTime < this.updateIntervalMs)) {
      return;
    }

    // Update state
    if (update.currentStep !== undefined) {
      this.state.currentStep = update.currentStep;
      this.state.percentage = Math.round((update.currentStep / this.state.totalSteps) * 100);

      // Estimate completion time
      const elapsed = now - new Date(this.state.startedAt).getTime();
      const rate = update.currentStep / elapsed; // steps per ms
      const remaining = this.state.totalSteps - update.currentStep;
      const eta = remaining / rate;

      this.state.estimatedCompletion = new Date(now + eta).toISOString();
    }

    if (update.message !== undefined) {
      this.state.message = update.message;
    }

    if (update.metadata !== undefined) {
      this.state.metadata = { ...this.state.metadata, ...update.metadata };
    }

    this.state.status = ProgressStatus.IN_PROGRESS;
    this.state.updatedAt = new Date().toISOString();

    this.writeProgress();
    this.lastUpdateTime = now;

    if (this.verbose) {
      console.log(`📊 [${this.state.percentage}%] ${this.state.message}`);
    }
  }

  /**
   * Mark as completed
   *
   * @param {string} [message] - Completion message
   */
  complete(message = 'Completed successfully') {
    this.state.status = ProgressStatus.COMPLETED;
    this.state.message = message;
    this.state.percentage = 100;
    this.state.currentStep = this.state.totalSteps;
    this.state.updatedAt = new Date().toISOString();
    this.state.estimatedCompletion = null;

    this.writeProgress(true);

    if (this.verbose) {
      console.log(`✅ ${message}`);
    }

    if (this.cleanupOnComplete) {
      this.cleanup();
    }
  }

  /**
   * Mark as failed
   *
   * @param {string} error - Error message
   */
  fail(error) {
    this.state.status = ProgressStatus.FAILED;
    this.state.message = `Failed: ${error}`;
    this.state.updatedAt = new Date().toISOString();
    this.state.estimatedCompletion = null;

    this.writeProgress(true);

    if (this.verbose) {
      console.error(`❌ ${error}`);
    }

    // Don't auto-cleanup on failure so user can investigate
  }

  /**
   * Write progress to file
   *
   * @param {boolean} force - Force write even if rate limited
   * @private
   */
  writeProgress(force = false) {
    writeProgressFile(this.progressFilePath, this.state);
  }

  /**
   * Clean up progress file
   */
  cleanup() {
    deleteProgressFile(this.progressFilePath);

    if (this.verbose) {
      console.log(`🧹 Progress file cleaned up`);
    }
  }

  /**
   * Get current progress state
   *
   * @returns {ProgressState}
   */
  getState() {
    return this.state;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * List all progress files
 *
 * @param {string} progressDir - Progress directory
 * @returns {Array<ProgressState>} All progress states
 */
function listAllProgress(progressDir = DEFAULT_CONFIG.progressDir) {
  if (!fs.existsSync(progressDir)) {
    return [];
  }

  const progressFiles = fs.readdirSync(progressDir).filter(f => f.endsWith('.progress.json'));
  const progressStates = [];

  for (const file of progressFiles) {
    const filePath = path.join(progressDir, file);
    const state = readProgressFile(filePath);

    if (state) {
      progressStates.push(state);
    }
  }

  return progressStates;
}

/**
 * Get progress for a specific script
 *
 * @param {string} scriptName - Script name
 * @param {string} progressDir - Progress directory
 * @returns {ProgressState|null}
 */
function getProgress(scriptName, progressDir = DEFAULT_CONFIG.progressDir) {
  const filePath = getProgressFilePath(scriptName, progressDir);
  return readProgressFile(filePath);
}

/**
 * Clean up old/completed progress files
 *
 * @param {string} progressDir - Progress directory
 * @returns {number} Number of files cleaned
 */
function cleanupCompletedProgress(progressDir = DEFAULT_CONFIG.progressDir) {
  const allProgress = listAllProgress(progressDir);
  let cleaned = 0;

  for (const state of allProgress) {
    if (state.status === ProgressStatus.COMPLETED) {
      const filePath = getProgressFilePath(state.scriptName, progressDir);
      deleteProgressFile(filePath);
      cleaned++;
    }
  }

  return cleaned;
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  const command = process.argv[2];

  if (!command) {
    console.log('Usage: node progress-file-writer.js <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  list              List all active progress');
    console.log('  get <script>      Get progress for specific script');
    console.log('  cleanup           Clean up completed progress files');
    console.log('');
    process.exit(1);
  }

  switch (command) {
    case 'list': {
      const allProgress = listAllProgress();

      console.log(`\n📊 Active Progress: ${allProgress.length}\n`);

      if (allProgress.length === 0) {
        console.log('No active operations found.');
      } else {
        allProgress.forEach((state, i) => {
          console.log(`${i + 1}. ${state.scriptName}`);
          console.log(`   Status: ${state.status}`);
          console.log(`   Progress: ${state.percentage}% (${state.currentStep}/${state.totalSteps})`);
          console.log(`   Message: ${state.message}`);
          console.log(`   Started: ${new Date(state.startedAt).toLocaleString()}`);

          if (state.estimatedCompletion) {
            console.log(`   ETA: ${new Date(state.estimatedCompletion).toLocaleString()}`);
          }

          console.log('');
        });
      }
      break;
    }

    case 'get': {
      const scriptName = process.argv[3];

      if (!scriptName) {
        console.error('❌ Usage: node progress-file-writer.js get <script-name>');
        process.exit(1);
      }

      const state = getProgress(scriptName);

      if (!state) {
        console.log(`No progress found for: ${scriptName}`);
      } else {
        console.log(`\n📊 Progress: ${scriptName}\n`);
        console.log(`Status: ${state.status}`);
        console.log(`Progress: ${state.percentage}% (${state.currentStep}/${state.totalSteps})`);
        console.log(`Message: ${state.message}`);
        console.log(`Started: ${new Date(state.startedAt).toLocaleString()}`);
        console.log(`Updated: ${new Date(state.updatedAt).toLocaleString()}`);

        if (state.estimatedCompletion) {
          console.log(`ETA: ${new Date(state.estimatedCompletion).toLocaleString()}`);
        }

        if (Object.keys(state.metadata).length > 0) {
          console.log(`\nMetadata:`);
          console.log(JSON.stringify(state.metadata, null, 2));
        }
      }
      break;
    }

    case 'cleanup': {
      const cleaned = cleanupCompletedProgress();
      console.log(`\n✅ Cleaned up ${cleaned} completed progress file(s)`);
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
  ProgressWriter,
  ProgressState,
  ProgressStatus,
  listAllProgress,
  getProgress,
  cleanupCompletedProgress,
  getProgressFilePath
};
