/**
 * ResultStore - Structured storage for task execution results
 *
 * Provides:
 * - Result storage with ResultBundle schema validation
 * - Result retrieval by task ID
 * - Artifact management
 * - Execution history tracking
 * - Persistence to disk
 */

const fs = require('fs');
const path = require('path');

class ResultStore {
  constructor(options = {}) {
    this.options = {
      persistDir: options.persistDir || null,
      validateSchema: options.validateSchema ?? true,
      maxHistorySize: options.maxHistorySize || 1000,
      ...options
    };

    this.results = new Map();
    this.history = [];
    this.artifacts = new Map();

    // Load persisted results if directory provided
    if (this.options.persistDir) {
      this.loadFromDisk();
    }
  }

  /**
   * Store a result bundle
   * @param {string} taskId - Task ID
   * @param {Object} resultBundle - Result bundle conforming to schema
   * @returns {ResultStore} this for chaining
   */
  storeResult(taskId, resultBundle) {
    if (this.options.validateSchema) {
      this.validateResultBundle(resultBundle);
    }

    const enrichedResult = {
      ...resultBundle,
      task_id: taskId,
      stored_at: new Date().toISOString()
    };

    this.results.set(taskId, enrichedResult);

    // Track history
    this.history.push({
      taskId,
      status: resultBundle.status,
      timestamp: enrichedResult.stored_at
    });

    // Trim history if needed
    if (this.history.length > this.options.maxHistorySize) {
      this.history = this.history.slice(-this.options.maxHistorySize);
    }

    // Index artifacts
    if (resultBundle.artifacts) {
      for (const artifact of resultBundle.artifacts) {
        const key = `${taskId}:${artifact.name}`;
        this.artifacts.set(key, artifact);
      }
    }

    // Persist if configured
    if (this.options.persistDir) {
      this.persistResult(taskId, enrichedResult);
    }

    return this;
  }

  /**
   * Get a result by task ID
   * @param {string} taskId - Task ID
   * @returns {Object|null} Result bundle or null if not found
   */
  getResult(taskId) {
    return this.results.get(taskId) || null;
  }

  /**
   * Get all results
   * @returns {Array<Object>} Array of result bundles
   */
  getAllResults() {
    return Array.from(this.results.values());
  }

  /**
   * Get results by status
   * @param {string} status - Status to filter by
   * @returns {Array<Object>} Filtered results
   */
  getResultsByStatus(status) {
    return this.getAllResults().filter(r => r.status === status);
  }

  /**
   * Get a specific artifact
   * @param {string} taskId - Task ID
   * @param {string} artifactName - Artifact name
   * @returns {Object|null} Artifact or null
   */
  getArtifact(taskId, artifactName) {
    return this.artifacts.get(`${taskId}:${artifactName}`) || null;
  }

  /**
   * Get all artifacts for a task
   * @param {string} taskId - Task ID
   * @returns {Array<Object>} Artifacts
   */
  getArtifactsForTask(taskId) {
    const result = this.results.get(taskId);
    return result?.artifacts || [];
  }

  /**
   * Check if a task has completed successfully
   * @param {string} taskId - Task ID
   * @returns {boolean} true if completed with success status
   */
  isTaskComplete(taskId) {
    const result = this.results.get(taskId);
    return result?.status === 'success';
  }

  /**
   * Get execution history
   * @param {Object} options - Filter options
   * @returns {Array<Object>} History entries
   */
  getHistory(options = {}) {
    let history = [...this.history];

    if (options.status) {
      history = history.filter(h => h.status === options.status);
    }

    if (options.since) {
      history = history.filter(h => new Date(h.timestamp) >= new Date(options.since));
    }

    if (options.limit) {
      history = history.slice(-options.limit);
    }

    return history;
  }

  /**
   * Get summary statistics
   * @returns {Object} Summary statistics
   */
  getSummary() {
    const results = this.getAllResults();
    const byStatus = {};

    for (const result of results) {
      byStatus[result.status] = (byStatus[result.status] || 0) + 1;
    }

    const totalRisks = results.reduce((sum, r) => sum + (r.risks?.length || 0), 0);
    const totalQuestions = results.reduce((sum, r) => sum + (r.open_questions?.length || 0), 0);

    return {
      total_results: results.length,
      by_status: byStatus,
      total_risks: totalRisks,
      total_open_questions: totalQuestions,
      artifact_count: this.artifacts.size,
      history_count: this.history.length
    };
  }

  /**
   * Validate a result bundle against schema
   * @private
   */
  validateResultBundle(resultBundle) {
    const required = ['task_id', 'status', 'summary'];
    const validStatuses = ['success', 'partial', 'failed', 'blocked', 'skipped'];

    for (const field of required) {
      if (!resultBundle[field] && field !== 'task_id') {
        throw new Error(`ResultBundle missing required field: ${field}`);
      }
    }

    if (!validStatuses.includes(resultBundle.status)) {
      throw new Error(`Invalid status: ${resultBundle.status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    return true;
  }

  /**
   * Persist result to disk
   * @private
   */
  persistResult(taskId, result) {
    if (!this.options.persistDir) return;

    const dir = this.options.persistDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, `${taskId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
  }

  /**
   * Load results from disk
   * @private
   */
  loadFromDisk() {
    const dir = this.options.persistDir;
    if (!dir || !fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const result = JSON.parse(content);

        if (result.task_id) {
          this.results.set(result.task_id, result);

          // Index artifacts
          if (result.artifacts) {
            for (const artifact of result.artifacts) {
              const key = `${result.task_id}:${artifact.name}`;
              this.artifacts.set(key, artifact);
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to load result from ${file}: ${e.message}`);
      }
    }
  }

  /**
   * Clear all results
   * @param {boolean} clearDisk - Also clear persisted results
   */
  clear(clearDisk = false) {
    this.results.clear();
    this.artifacts.clear();
    this.history = [];

    if (clearDisk && this.options.persistDir && fs.existsSync(this.options.persistDir)) {
      const files = fs.readdirSync(this.options.persistDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        fs.unlinkSync(path.join(this.options.persistDir, file));
      }
    }
  }

  /**
   * Merge evidence from multiple results
   * @param {Array<string>} taskIds - Task IDs to merge evidence from
   * @returns {Array<Object>} Combined evidence array
   */
  mergeEvidence(taskIds) {
    const evidence = [];

    for (const taskId of taskIds) {
      const result = this.results.get(taskId);
      if (result?.evidence) {
        for (const e of result.evidence) {
          evidence.push({
            ...e,
            source_task: taskId
          });
        }
      }
    }

    return evidence;
  }

  /**
   * Generate a combined report from all results
   * @returns {Object} Combined report
   */
  generateReport() {
    const results = this.getAllResults();

    return {
      generated_at: new Date().toISOString(),
      summary: this.getSummary(),
      results: results.map(r => ({
        task_id: r.task_id,
        status: r.status,
        summary: r.summary,
        files_changed_count: r.files_changed?.length || 0,
        risks_count: r.risks?.length || 0,
        open_questions: r.open_questions || []
      })),
      all_risks: results.flatMap(r => (r.risks || []).map(risk => ({
        ...risk,
        source_task: r.task_id
      }))),
      all_next_steps: results.flatMap(r => (r.next_steps || []).map(step => ({
        step,
        source_task: r.task_id
      })))
    };
  }

  /**
   * Export all results to a single JSON file
   * @param {string} filePath - Output file path
   */
  exportToFile(filePath) {
    const data = {
      exported_at: new Date().toISOString(),
      results: this.getAllResults(),
      summary: this.getSummary()
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}

module.exports = { ResultStore };
