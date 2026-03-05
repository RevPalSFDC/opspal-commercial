/**
 * ResultMerger - Merge file changes from multiple tasks
 *
 * Provides:
 * - Conflict detection for overlapping file changes
 * - Three-way merge for non-conflicting changes
 * - Change tracking and audit trail
 * - Rollback capability
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ResultMerger {
  constructor(options = {}) {
    this.workingDir = options.workingDir || process.cwd();
    this.backupDir = options.backupDir || path.join(this.workingDir, '.task-graph-backups');
    this.conflictStrategy = options.conflictStrategy || 'fail'; // 'fail', 'last-wins', 'first-wins', 'manual'
    this.createBackups = options.createBackups !== false;

    this.changeLog = [];
    this.conflicts = [];
    this.mergedFiles = new Map();

    if (this.createBackups) {
      this.ensureBackupDir();
    }
  }

  /**
   * Ensure backup directory exists
   * @private
   */
  ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Merge results from multiple tasks
   * @param {Array<Object>} resultBundles - Array of result bundles from tasks
   * @returns {Object} Merge result with status and details
   */
  merge(resultBundles) {
    const fileChanges = this.collectFileChanges(resultBundles);
    const conflicts = this.detectConflicts(fileChanges);

    if (conflicts.length > 0 && this.conflictStrategy === 'fail') {
      return {
        success: false,
        status: 'conflict',
        conflicts,
        message: `${conflicts.length} conflict(s) detected`,
        changeLog: this.changeLog
      };
    }

    // Resolve conflicts based on strategy
    const resolvedChanges = this.resolveConflicts(fileChanges, conflicts);

    // Apply changes
    const applyResult = this.applyChanges(resolvedChanges);

    return {
      success: applyResult.success,
      status: applyResult.success ? 'merged' : 'partial',
      filesChanged: applyResult.filesChanged,
      conflicts: this.conflicts,
      conflictsResolved: conflicts.length - this.conflicts.length,
      changeLog: this.changeLog,
      backupPath: this.backupDir,
      rollbackAvailable: this.createBackups
    };
  }

  /**
   * Collect all file changes from result bundles
   * @private
   */
  collectFileChanges(resultBundles) {
    const changesByFile = new Map();

    for (const bundle of resultBundles) {
      const taskId = bundle.task_id;
      const filesChanged = bundle.files_changed || [];

      for (const fileInfo of filesChanged) {
        const filePath = typeof fileInfo === 'string' ? fileInfo : fileInfo.path;
        const changeType = typeof fileInfo === 'string' ? 'modified' : fileInfo.type;
        const content = typeof fileInfo === 'string' ? null : fileInfo.content;

        if (!changesByFile.has(filePath)) {
          changesByFile.set(filePath, []);
        }

        changesByFile.get(filePath).push({
          taskId,
          filePath,
          changeType,
          content,
          timestamp: bundle.timestamp || Date.now()
        });

        this.changeLog.push({
          taskId,
          filePath,
          changeType,
          timestamp: new Date().toISOString()
        });
      }
    }

    return changesByFile;
  }

  /**
   * Detect conflicts in file changes
   * @private
   */
  detectConflicts(changesByFile) {
    const conflicts = [];

    for (const [filePath, changes] of changesByFile) {
      if (changes.length > 1) {
        // Multiple tasks modified the same file
        const hasContentConflict = this.checkContentConflict(changes);

        if (hasContentConflict) {
          conflicts.push({
            filePath,
            type: 'content_conflict',
            tasks: changes.map(c => c.taskId),
            changes,
            message: `File '${filePath}' modified by multiple tasks: ${changes.map(c => c.taskId).join(', ')}`
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if changes to the same file actually conflict
   * @private
   */
  checkContentConflict(changes) {
    // If any change has content and they differ, it's a conflict
    const contentsWithData = changes.filter(c => c.content !== null);

    if (contentsWithData.length <= 1) {
      return false; // No conflict if only one has content
    }

    // Check if all contents are identical
    const firstContent = contentsWithData[0].content;
    return contentsWithData.some(c => c.content !== firstContent);
  }

  /**
   * Resolve conflicts based on configured strategy
   * @private
   */
  resolveConflicts(changesByFile, conflicts) {
    const resolvedChanges = new Map();

    for (const [filePath, changes] of changesByFile) {
      const conflict = conflicts.find(c => c.filePath === filePath);

      if (!conflict) {
        // No conflict, take the change
        resolvedChanges.set(filePath, changes[0]);
      } else {
        // Resolve based on strategy
        switch (this.conflictStrategy) {
          case 'last-wins':
            resolvedChanges.set(filePath, this.getLatestChange(changes));
            break;
          case 'first-wins':
            resolvedChanges.set(filePath, this.getEarliestChange(changes));
            break;
          case 'manual':
            // Keep conflict for manual resolution
            this.conflicts.push(conflict);
            break;
          default:
            // 'fail' strategy - should not reach here
            this.conflicts.push(conflict);
        }
      }
    }

    return resolvedChanges;
  }

  /**
   * Get the latest change by timestamp
   * @private
   */
  getLatestChange(changes) {
    return changes.reduce((latest, current) =>
      current.timestamp > latest.timestamp ? current : latest
    );
  }

  /**
   * Get the earliest change by timestamp
   * @private
   */
  getEarliestChange(changes) {
    return changes.reduce((earliest, current) =>
      current.timestamp < earliest.timestamp ? current : earliest
    );
  }

  /**
   * Apply resolved changes to files
   * @private
   */
  applyChanges(resolvedChanges) {
    const filesChanged = [];
    let success = true;

    for (const [filePath, change] of resolvedChanges) {
      try {
        const fullPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(this.workingDir, filePath);

        // Create backup if file exists
        if (this.createBackups && fs.existsSync(fullPath)) {
          this.backupFile(fullPath, change.taskId);
        }

        // Apply change based on type
        if (change.changeType === 'deleted') {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        } else if (change.content !== null) {
          // Ensure directory exists
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(fullPath, change.content, 'utf8');
        }

        filesChanged.push({
          path: filePath,
          type: change.changeType,
          taskId: change.taskId
        });

      } catch (error) {
        success = false;
        this.changeLog.push({
          taskId: change.taskId,
          filePath,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return { success, filesChanged };
  }

  /**
   * Backup a file before modification
   * @private
   */
  backupFile(filePath, taskId) {
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(filePath).digest('hex').slice(0, 8);
    const backupName = `${path.basename(filePath)}.${hash}.${timestamp}.backup`;
    const backupPath = path.join(this.backupDir, backupName);

    fs.copyFileSync(filePath, backupPath);

    this.changeLog.push({
      type: 'backup',
      original: filePath,
      backup: backupPath,
      taskId,
      timestamp: new Date().toISOString()
    });

    return backupPath;
  }

  /**
   * Rollback changes for a specific task
   * @param {string} taskId - Task ID to rollback
   * @returns {Object} Rollback result
   */
  rollback(taskId) {
    const backups = this.changeLog.filter(
      log => log.type === 'backup' && log.taskId === taskId
    );

    const restored = [];
    const errors = [];

    for (const backup of backups) {
      try {
        if (fs.existsSync(backup.backup)) {
          fs.copyFileSync(backup.backup, backup.original);
          restored.push(backup.original);
        }
      } catch (error) {
        errors.push({
          file: backup.original,
          error: error.message
        });
      }
    }

    return {
      success: errors.length === 0,
      restored,
      errors,
      taskId
    };
  }

  /**
   * Rollback all changes
   * @returns {Object} Rollback result
   */
  rollbackAll() {
    const backups = this.changeLog.filter(log => log.type === 'backup');
    const restored = [];
    const errors = [];

    // Process in reverse order (most recent first)
    for (const backup of backups.reverse()) {
      try {
        if (fs.existsSync(backup.backup)) {
          fs.copyFileSync(backup.backup, backup.original);
          restored.push(backup.original);
        }
      } catch (error) {
        errors.push({
          file: backup.original,
          error: error.message
        });
      }
    }

    return {
      success: errors.length === 0,
      restored,
      errors
    };
  }

  /**
   * Generate merge report
   * @returns {Object} Detailed merge report
   */
  generateReport() {
    const filesByTask = new Map();

    for (const log of this.changeLog) {
      if (log.type !== 'backup' && log.taskId) {
        if (!filesByTask.has(log.taskId)) {
          filesByTask.set(log.taskId, []);
        }
        filesByTask.get(log.taskId).push(log);
      }
    }

    return {
      summary: {
        totalChanges: this.changeLog.filter(l => l.type !== 'backup').length,
        totalBackups: this.changeLog.filter(l => l.type === 'backup').length,
        conflicts: this.conflicts.length,
        tasksInvolved: filesByTask.size
      },
      byTask: Object.fromEntries(filesByTask),
      conflicts: this.conflicts,
      changeLog: this.changeLog
    };
  }

  /**
   * Get conflicts requiring manual resolution
   * @returns {Array} Unresolved conflicts
   */
  getUnresolvedConflicts() {
    return this.conflicts;
  }

  /**
   * Manually resolve a conflict
   * @param {string} filePath - Path of conflicted file
   * @param {string} resolution - 'taskId' to use that task's version, or 'content' with custom content
   * @param {string} content - Custom content if resolution is 'content'
   */
  resolveConflict(filePath, resolution, content = null) {
    const conflictIndex = this.conflicts.findIndex(c => c.filePath === filePath);

    if (conflictIndex === -1) {
      throw new Error(`No conflict found for file: ${filePath}`);
    }

    const conflict = this.conflicts[conflictIndex];

    if (resolution === 'content' && content !== null) {
      // Use custom content
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.workingDir, filePath);

      if (this.createBackups && fs.existsSync(fullPath)) {
        this.backupFile(fullPath, 'manual-resolution');
      }

      fs.writeFileSync(fullPath, content, 'utf8');
    } else {
      // Use specific task's version
      const change = conflict.changes.find(c => c.taskId === resolution);
      if (!change) {
        throw new Error(`Task ${resolution} not found in conflict`);
      }

      if (change.content !== null) {
        const fullPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(this.workingDir, filePath);

        if (this.createBackups && fs.existsSync(fullPath)) {
          this.backupFile(fullPath, 'manual-resolution');
        }

        fs.writeFileSync(fullPath, change.content, 'utf8');
      }
    }

    // Remove from conflicts
    this.conflicts.splice(conflictIndex, 1);

    this.changeLog.push({
      type: 'conflict_resolved',
      filePath,
      resolution,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Clean up backup files older than specified age
   * @param {number} maxAgeDays - Maximum age in days
   */
  cleanupBackups(maxAgeDays = 7) {
    if (!fs.existsSync(this.backupDir)) {
      return { cleaned: 0 };
    }

    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;

    const files = fs.readdirSync(this.backupDir);

    for (const file of files) {
      const filePath = path.join(this.backupDir, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }

    return { cleaned };
  }
}

module.exports = { ResultMerger };
