#!/usr/bin/env node
/**
 * Intake Queue Manager
 *
 * Manages a centralized queue for project intake submissions.
 * Intakes are submitted to ~/.claude/intake/ for Claude Code to process.
 *
 * Queue Structure:
 *   ~/.claude/intake/
 *   ├── pending/           # New intakes awaiting processing
 *   ├── processing/        # Currently being processed
 *   ├── completed/         # Successfully processed
 *   ├── failed/            # Failed processing (needs review)
 *   └── archive/           # Old completed intakes
 *
 * Usage:
 *   node intake-queue-manager.js submit <json-file>
 *   node intake-queue-manager.js list [--status pending|processing|completed|failed]
 *   node intake-queue-manager.js process <intake-id>
 *   node intake-queue-manager.js status <intake-id>
 *   node intake-queue-manager.js watch
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class IntakeQueueManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(os.homedir(), '.claude', 'intake');
    this.dirs = {
      pending: path.join(this.baseDir, 'pending'),
      processing: path.join(this.baseDir, 'processing'),
      completed: path.join(this.baseDir, 'completed'),
      failed: path.join(this.baseDir, 'failed'),
      archive: path.join(this.baseDir, 'archive')
    };

    this.ensureDirectories();
  }

  /**
   * Ensure queue directories exist
   */
  ensureDirectories() {
    Object.values(this.dirs).forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Generate unique intake ID
   */
  generateIntakeId(projectName = 'project') {
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const random = Math.random().toString(36).substring(2, 6);
    return `${safeName}-${timestamp}-${random}`;
  }

  /**
   * Submit intake to queue
   */
  submit(intakeData, options = {}) {
    // Validate intake data
    if (!intakeData || typeof intakeData !== 'object') {
      throw new Error('Invalid intake data');
    }

    // Generate intake ID
    const projectName = intakeData.projectIdentity?.projectName || 'unnamed';
    const intakeId = this.generateIntakeId(projectName);

    // Add queue metadata
    const queuedIntake = {
      ...intakeData,
      _queue: {
        id: intakeId,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        submittedBy: intakeData.projectIdentity?.projectOwner?.email || os.userInfo().username,
        source: options.source || 'manual',
        priority: intakeData.projectIdentity?.priority || 'medium',
        attempts: 0,
        lastError: null
      }
    };

    // Write to pending directory
    const filePath = path.join(this.dirs.pending, `${intakeId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(queuedIntake, null, 2));

    console.log(`✅ Intake submitted: ${intakeId}`);
    console.log(`   Location: ${filePath}`);

    // Create notification file for watchers
    this.notifyNewIntake(intakeId, queuedIntake);

    return {
      intakeId,
      filePath,
      status: 'pending'
    };
  }

  /**
   * Notify watchers of new intake
   */
  notifyNewIntake(intakeId, intakeData) {
    const notificationPath = path.join(this.baseDir, '.notifications');
    if (!fs.existsSync(notificationPath)) {
      fs.mkdirSync(notificationPath, { recursive: true });
    }

    const notification = {
      type: 'new_intake',
      intakeId,
      projectName: intakeData.projectIdentity?.projectName,
      priority: intakeData._queue?.priority,
      timestamp: new Date().toISOString()
    };

    const notifyFile = path.join(notificationPath, `${Date.now()}-${intakeId}.json`);
    fs.writeFileSync(notifyFile, JSON.stringify(notification, null, 2));
  }

  /**
   * List intakes by status
   */
  list(status = 'pending') {
    const dir = this.dirs[status];
    if (!dir || !fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    return files.map(file => {
      const filePath = path.join(dir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return {
          id: data._queue?.id || file.replace('.json', ''),
          projectName: data.projectIdentity?.projectName,
          priority: data._queue?.priority,
          submittedAt: data._queue?.submittedAt,
          status: data._queue?.status,
          filePath
        };
      } catch (e) {
        return { id: file.replace('.json', ''), error: e.message, filePath };
      }
    });
  }

  /**
   * Get all pending intakes (for Claude Code to process)
   */
  getPending() {
    const pending = this.list('pending');
    // Sort by priority (critical > high > medium > low) then by date
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return pending.sort((a, b) => {
      const pA = priorityOrder[a.priority] ?? 2;
      const pB = priorityOrder[b.priority] ?? 2;
      if (pA !== pB) return pA - pB;
      return new Date(a.submittedAt) - new Date(b.submittedAt);
    });
  }

  /**
   * Get intake by ID
   */
  getIntake(intakeId) {
    for (const [status, dir] of Object.entries(this.dirs)) {
      const filePath = path.join(dir, `${intakeId}.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return { ...data, _currentStatus: status, _filePath: filePath };
      }
    }
    return null;
  }

  /**
   * Move intake to processing
   */
  startProcessing(intakeId) {
    const intake = this.getIntake(intakeId);
    if (!intake) {
      throw new Error(`Intake not found: ${intakeId}`);
    }

    if (intake._currentStatus !== 'pending') {
      throw new Error(`Intake is not pending (current status: ${intake._currentStatus})`);
    }

    // Update metadata
    intake._queue.status = 'processing';
    intake._queue.processingStartedAt = new Date().toISOString();
    intake._queue.attempts = (intake._queue.attempts || 0) + 1;

    // Move file
    const oldPath = intake._filePath;
    const newPath = path.join(this.dirs.processing, `${intakeId}.json`);

    delete intake._currentStatus;
    delete intake._filePath;

    fs.writeFileSync(newPath, JSON.stringify(intake, null, 2));
    fs.unlinkSync(oldPath);

    return { intakeId, status: 'processing', filePath: newPath };
  }

  /**
   * Mark intake as completed
   */
  complete(intakeId, result = {}) {
    const intake = this.getIntake(intakeId);
    if (!intake) {
      throw new Error(`Intake not found: ${intakeId}`);
    }

    // Update metadata
    intake._queue.status = 'completed';
    intake._queue.completedAt = new Date().toISOString();
    intake._queue.result = result;

    // Move file
    const oldPath = intake._filePath;
    const newPath = path.join(this.dirs.completed, `${intakeId}.json`);

    delete intake._currentStatus;
    delete intake._filePath;

    fs.writeFileSync(newPath, JSON.stringify(intake, null, 2));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

    console.log(`✅ Intake completed: ${intakeId}`);
    return { intakeId, status: 'completed', filePath: newPath };
  }

  /**
   * Mark intake as failed
   */
  fail(intakeId, error) {
    const intake = this.getIntake(intakeId);
    if (!intake) {
      throw new Error(`Intake not found: ${intakeId}`);
    }

    // Update metadata
    intake._queue.status = 'failed';
    intake._queue.failedAt = new Date().toISOString();
    intake._queue.lastError = error.message || String(error);

    // Move file
    const oldPath = intake._filePath;
    const newPath = path.join(this.dirs.failed, `${intakeId}.json`);

    delete intake._currentStatus;
    delete intake._filePath;

    fs.writeFileSync(newPath, JSON.stringify(intake, null, 2));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

    console.log(`❌ Intake failed: ${intakeId}`);
    return { intakeId, status: 'failed', error: intake._queue.lastError, filePath: newPath };
  }

  /**
   * Retry failed intake
   */
  retry(intakeId) {
    const intake = this.getIntake(intakeId);
    if (!intake) {
      throw new Error(`Intake not found: ${intakeId}`);
    }

    if (intake._currentStatus !== 'failed') {
      throw new Error(`Intake is not failed (current status: ${intake._currentStatus})`);
    }

    // Update metadata
    intake._queue.status = 'pending';
    intake._queue.retriedAt = new Date().toISOString();

    // Move file back to pending
    const oldPath = intake._filePath;
    const newPath = path.join(this.dirs.pending, `${intakeId}.json`);

    delete intake._currentStatus;
    delete intake._filePath;

    fs.writeFileSync(newPath, JSON.stringify(intake, null, 2));
    fs.unlinkSync(oldPath);

    console.log(`🔄 Intake retried: ${intakeId}`);
    return { intakeId, status: 'pending', filePath: newPath };
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      pending: this.list('pending').length,
      processing: this.list('processing').length,
      completed: this.list('completed').length,
      failed: this.list('failed').length,
      baseDir: this.baseDir
    };
  }

  /**
   * Archive old completed intakes (older than 30 days)
   */
  archiveOld(daysOld = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const completed = this.list('completed');
    let archived = 0;

    completed.forEach(intake => {
      try {
        const data = JSON.parse(fs.readFileSync(intake.filePath, 'utf-8'));
        const completedAt = new Date(data._queue?.completedAt);

        if (completedAt < cutoff) {
          const archivePath = path.join(this.dirs.archive, path.basename(intake.filePath));
          fs.renameSync(intake.filePath, archivePath);
          archived++;
        }
      } catch (e) {
        // Skip files that can't be processed
      }
    });

    console.log(`📦 Archived ${archived} old intakes`);
    return archived;
  }

  /**
   * Clear notifications
   */
  clearNotifications() {
    const notificationPath = path.join(this.baseDir, '.notifications');
    if (fs.existsSync(notificationPath)) {
      const files = fs.readdirSync(notificationPath);
      files.forEach(f => fs.unlinkSync(path.join(notificationPath, f)));
    }
  }

  /**
   * Get Claude Code prompt for processing pending intakes
   */
  getProcessingPrompt() {
    const pending = this.getPending();
    if (pending.length === 0) {
      return 'No pending intakes to process.';
    }

    let prompt = `There are ${pending.length} pending project intake(s) to process:\n\n`;

    pending.forEach((intake, i) => {
      prompt += `${i + 1}. **${intake.projectName || 'Unnamed Project'}**\n`;
      prompt += `   - ID: ${intake.id}\n`;
      prompt += `   - Priority: ${intake.priority}\n`;
      prompt += `   - Submitted: ${intake.submittedAt}\n`;
      prompt += `   - File: ${intake.filePath}\n\n`;
    });

    prompt += `\nTo process an intake, read the JSON file and:
1. Validate the intake data
2. Generate the PROJECT_RUNBOOK.md
3. Create Asana project with tasks (if configured)
4. Mark as complete: \`node intake-queue-manager.js complete <intake-id>\``;

    return prompt;
  }

  /**
   * Watch for new intake submissions
   * @param {Object} options - Watch options
   * @param {number} options.duration - How long to watch in minutes (default: 30)
   * @param {number} options.interval - Check interval in seconds (default: 5)
   * @param {Function} options.onNew - Callback when new intake detected
   * @param {boolean} options.autoProcess - Auto-start processing (default: false)
   */
  watch(options = {}) {
    const duration = (options.duration || 30) * 60 * 1000; // Convert to ms
    const interval = (options.interval || 5) * 1000; // Convert to ms
    const onNew = options.onNew || null;
    const autoProcess = options.autoProcess || false;

    const startTime = Date.now();
    const endTime = startTime + duration;
    let knownIntakes = new Set(this.list('pending').map(i => i.id));
    let newIntakeCount = 0;

    console.log(`\n👀 Watching for new intake submissions...`);
    console.log(`   Duration: ${options.duration || 30} minutes`);
    console.log(`   Interval: ${options.interval || 5} seconds`);
    console.log(`   Queue: ${this.dirs.pending}`);
    console.log(`   Press Ctrl+C to stop\n`);

    const checkForNew = () => {
      const currentIntakes = this.list('pending');
      const currentIds = new Set(currentIntakes.map(i => i.id));

      // Find new intakes
      currentIntakes.forEach(intake => {
        if (!knownIntakes.has(intake.id)) {
          newIntakeCount++;
          const timestamp = new Date().toLocaleTimeString();

          console.log(`\n🆕 [${timestamp}] NEW INTAKE DETECTED!`);
          console.log(`   ID: ${intake.id}`);
          console.log(`   Project: ${intake.projectName || 'Unnamed'}`);
          console.log(`   Priority: ${intake.priority || 'medium'}`);
          console.log(`   File: ${intake.filePath}`);

          // Callback if provided
          if (onNew && typeof onNew === 'function') {
            onNew(intake);
          }

          // Auto-process if enabled
          if (autoProcess) {
            console.log(`   Auto-processing...`);
            this.startProcessing(intake.id);
          }

          knownIntakes.add(intake.id);
        }
      });

      // Update known intakes (in case some were processed)
      knownIntakes = currentIds;
    };

    // Initial check
    const initialCount = knownIntakes.size;
    if (initialCount > 0) {
      console.log(`📋 Found ${initialCount} existing pending intake(s)`);
    }

    // Set up interval
    const intervalId = setInterval(() => {
      const remaining = Math.ceil((endTime - Date.now()) / 60000);

      if (Date.now() >= endTime) {
        clearInterval(intervalId);
        console.log(`\n⏱️  Watch period ended`);
        console.log(`   New intakes detected: ${newIntakeCount}`);
        console.log(`   Total pending now: ${this.list('pending').length}`);
        return;
      }

      checkForNew();

      // Show heartbeat every minute
      if (Math.floor((Date.now() - startTime) / 60000) % 1 === 0) {
        process.stdout.write(`\r   ⏳ Watching... ${remaining} min remaining | ${newIntakeCount} new detected`);
      }
    }, interval);

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      clearInterval(intervalId);
      console.log(`\n\n🛑 Watch stopped by user`);
      console.log(`   New intakes detected: ${newIntakeCount}`);
      console.log(`   Total pending now: ${this.list('pending').length}`);
      process.exit(0);
    });

    return {
      stop: () => {
        clearInterval(intervalId);
        return { newIntakeCount, pending: this.list('pending').length };
      }
    };
  }

  /**
   * One-time check for pending intakes and return status
   */
  checkPending() {
    const pending = this.getPending();
    const stats = this.getStats();

    return {
      hasPending: pending.length > 0,
      pendingCount: pending.length,
      pending: pending,
      stats: stats,
      prompt: this.getProcessingPrompt()
    };
  }
}

// CLI execution
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new IntakeQueueManager();

  switch (command) {
    case 'submit': {
      const jsonPath = args[1];
      if (!jsonPath) {
        console.error('Usage: intake-queue-manager.js submit <json-file>');
        process.exit(1);
      }
      if (!fs.existsSync(jsonPath)) {
        console.error(`File not found: ${jsonPath}`);
        process.exit(1);
      }
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      manager.submit(data, { source: 'cli' });
      break;
    }

    case 'list': {
      const status = args[1] || 'pending';
      const intakes = manager.list(status);
      if (intakes.length === 0) {
        console.log(`No ${status} intakes`);
      } else {
        console.log(`\n${status.toUpperCase()} INTAKES (${intakes.length}):\n`);
        intakes.forEach(intake => {
          console.log(`  ${intake.id}`);
          console.log(`    Project: ${intake.projectName || 'N/A'}`);
          console.log(`    Priority: ${intake.priority || 'N/A'}`);
          console.log(`    Submitted: ${intake.submittedAt || 'N/A'}`);
          console.log('');
        });
      }
      break;
    }

    case 'pending': {
      const pending = manager.getPending();
      console.log(manager.getProcessingPrompt());
      break;
    }

    case 'get': {
      const intakeId = args[1];
      if (!intakeId) {
        console.error('Usage: intake-queue-manager.js get <intake-id>');
        process.exit(1);
      }
      const intake = manager.getIntake(intakeId);
      if (!intake) {
        console.error(`Intake not found: ${intakeId}`);
        process.exit(1);
      }
      console.log(JSON.stringify(intake, null, 2));
      break;
    }

    case 'start': {
      const intakeId = args[1];
      if (!intakeId) {
        console.error('Usage: intake-queue-manager.js start <intake-id>');
        process.exit(1);
      }
      manager.startProcessing(intakeId);
      break;
    }

    case 'complete': {
      const intakeId = args[1];
      if (!intakeId) {
        console.error('Usage: intake-queue-manager.js complete <intake-id>');
        process.exit(1);
      }
      manager.complete(intakeId, { completedBy: 'cli' });
      break;
    }

    case 'fail': {
      const intakeId = args[1];
      const error = args[2] || 'Manual failure';
      if (!intakeId) {
        console.error('Usage: intake-queue-manager.js fail <intake-id> [error-message]');
        process.exit(1);
      }
      manager.fail(intakeId, new Error(error));
      break;
    }

    case 'retry': {
      const intakeId = args[1];
      if (!intakeId) {
        console.error('Usage: intake-queue-manager.js retry <intake-id>');
        process.exit(1);
      }
      manager.retry(intakeId);
      break;
    }

    case 'stats': {
      const stats = manager.getStats();
      console.log('\nINTAKE QUEUE STATISTICS:\n');
      console.log(`  Pending:    ${stats.pending}`);
      console.log(`  Processing: ${stats.processing}`);
      console.log(`  Completed:  ${stats.completed}`);
      console.log(`  Failed:     ${stats.failed}`);
      console.log(`\n  Queue Dir:  ${stats.baseDir}`);
      break;
    }

    case 'archive': {
      const days = parseInt(args[1]) || 30;
      manager.archiveOld(days);
      break;
    }

    case 'path': {
      console.log(manager.baseDir);
      break;
    }

    case 'watch': {
      const durationArg = args.find(a => a.startsWith('--duration='));
      const intervalArg = args.find(a => a.startsWith('--interval='));
      const autoProcess = args.includes('--auto-process');

      const duration = durationArg ? parseInt(durationArg.split('=')[1]) : 30;
      const interval = intervalArg ? parseInt(intervalArg.split('=')[1]) : 5;

      manager.watch({
        duration,
        interval,
        autoProcess,
        onNew: (intake) => {
          // Could trigger Claude Code notification here
          console.log(`\n   💡 Run: /intake --form-data ${intake.filePath}`);
        }
      });
      break;
    }

    case 'check': {
      const status = manager.checkPending();
      if (status.hasPending) {
        console.log(`\n📬 ${status.pendingCount} pending intake(s) found!\n`);
        status.pending.forEach(p => {
          console.log(`  • ${p.projectName || 'Unnamed'} (${p.priority})`);
          console.log(`    ID: ${p.id}`);
        });
        console.log(`\nRun 'watch' to monitor for new submissions`);
        console.log(`Run '/intake --form-data <file>' to process`);
      } else {
        console.log(`\n✨ No pending intakes in queue`);
      }
      break;
    }

    default:
      console.log(`
Intake Queue Manager
====================

Manages centralized intake submission queue for Claude Code processing.

Commands:
  submit <json-file>     Submit intake to queue
  list [status]          List intakes (pending|processing|completed|failed)
  pending                Show pending intakes with processing prompt
  get <intake-id>        Get full intake data
  start <intake-id>      Mark intake as processing
  complete <intake-id>   Mark intake as completed
  fail <intake-id> [msg] Mark intake as failed
  retry <intake-id>      Retry failed intake
  stats                  Show queue statistics
  archive [days]         Archive completed intakes older than N days
  path                   Show queue directory path
  watch [options]        Monitor for new submissions
  check                  Quick check for pending intakes

Watch Options:
  --duration=N           Watch for N minutes (default: 30)
  --interval=N           Check every N seconds (default: 5)
  --auto-process         Automatically start processing new intakes

Queue Location: ${manager.baseDir}
`);
  }
}

// Export for use as module
module.exports = IntakeQueueManager;

// Run CLI if executed directly
if (require.main === module) {
  main();
}
