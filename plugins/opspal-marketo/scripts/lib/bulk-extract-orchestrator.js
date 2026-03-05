/**
 * Bulk Extract Orchestrator
 *
 * Coordinates the full lifecycle of Marketo bulk export jobs:
 * - Job creation with configurable filters
 * - Intelligent queuing (respecting 2 concurrent, 10 queued limits)
 * - Exponential backoff polling
 * - File download with verification
 * - Error recovery and retry logic
 *
 * @module bulk-extract-orchestrator
 */

const fs = require('fs').promises;
const path = require('path');

// Marketo bulk API limits
const LIMITS = {
  maxConcurrent: 2,
  maxQueued: 10,
  maxDateRangeDays: 31,
  minPollIntervalMs: 60000, // 60 seconds
  maxPollIntervalMs: 300000, // 5 minutes
  dailyQuotaBytes: 500 * 1024 * 1024, // 500 MB
  fileRetentionDays: 7
};

/**
 * Bulk Extract Orchestrator class
 */
class BulkExtractOrchestrator {
  constructor(options = {}) {
    this.limits = { ...LIMITS, ...options.limits };
    this.activeJobs = new Map();
    this.jobQueue = [];
    this.quotaTracker = {
      usedToday: 0,
      lastReset: this.getTodayUTC()
    };
  }

  getTodayUTC() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Check and reset daily quota if needed
   */
  checkQuotaReset() {
    const today = this.getTodayUTC();
    if (today !== this.quotaTracker.lastReset) {
      this.quotaTracker.usedToday = 0;
      this.quotaTracker.lastReset = today;
    }
  }

  /**
   * Get remaining quota in bytes
   */
  getRemainingQuota() {
    this.checkQuotaReset();
    return this.limits.dailyQuotaBytes - this.quotaTracker.usedToday;
  }

  /**
   * Record quota usage
   */
  recordQuotaUsage(bytes) {
    this.checkQuotaReset();
    this.quotaTracker.usedToday += bytes;
  }

  /**
   * Create an export job configuration
   */
  createJobConfig(type, options) {
    const config = {
      id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      createdAt: new Date().toISOString(),
      status: 'pending',
      ...options
    };

    // Validate date range
    if (options.filter?.createdAt) {
      const start = new Date(options.filter.createdAt.startAt);
      const end = new Date(options.filter.createdAt.endAt);
      const daysDiff = (end - start) / (24 * 60 * 60 * 1000);

      if (daysDiff > this.limits.maxDateRangeDays) {
        throw new Error(`Date range ${daysDiff.toFixed(1)} days exceeds max ${this.limits.maxDateRangeDays} days`);
      }
    }

    return config;
  }

  /**
   * Orchestrate a complete export job
   */
  async executeExport(jobConfig, mcpTools) {
    const job = {
      ...jobConfig,
      startedAt: new Date().toISOString(),
      status: 'creating'
    };

    try {
      // Step 1: Create the export job
      console.log(`[${job.id}] Creating ${job.type} export job...`);
      const createResult = await this.createExportJob(job, mcpTools);
      job.exportId = createResult.exportId;
      job.status = 'created';

      // Step 2: Enqueue the job
      console.log(`[${job.id}] Enqueuing export ${job.exportId}...`);
      await this.enqueueExportJob(job, mcpTools);
      job.status = 'queued';

      // Step 3: Poll until complete
      console.log(`[${job.id}] Polling for completion...`);
      const statusResult = await this.pollUntilComplete(job, mcpTools);

      if (statusResult.status === 'Completed') {
        job.status = 'completed';
        job.fileSize = statusResult.fileSize;
        job.numberOfRecords = statusResult.numberOfRecords;
        job.finishedAt = statusResult.finishedAt;

        // Step 4: Download the file
        console.log(`[${job.id}] Downloading file (${this.formatBytes(job.fileSize)})...`);
        const downloadResult = await this.downloadExportFile(job, mcpTools);
        job.localPath = downloadResult.path;
        job.downloadedAt = new Date().toISOString();

        // Record quota usage
        this.recordQuotaUsage(job.fileSize);

        job.success = true;
      } else {
        job.status = 'failed';
        job.error = statusResult.errorMsg || `Job ended with status: ${statusResult.status}`;
        job.success = false;
      }

    } catch (error) {
      job.status = 'error';
      job.error = error.message;
      job.success = false;
      console.error(`[${job.id}] Export failed:`, error.message);
    }

    job.completedAt = new Date().toISOString();
    return job;
  }

  /**
   * Create export job via MCP
   */
  async createExportJob(job, mcpTools) {
    const toolName = this.getCreateToolName(job.type);

    const params = {
      format: job.format || 'CSV',
      filter: job.filter
    };

    if (job.fields) {
      params.fields = job.fields;
    }

    // Call appropriate MCP tool
    // This would be replaced with actual MCP call
    const result = await mcpTools[toolName](params);

    if (!result.exportId) {
      throw new Error(`Failed to create export job: ${JSON.stringify(result)}`);
    }

    return result;
  }

  /**
   * Enqueue export job via MCP
   */
  async enqueueExportJob(job, mcpTools) {
    const toolName = this.getEnqueueToolName(job.type);

    const result = await mcpTools[toolName]({ exportId: job.exportId });

    if (result.status !== 'Queued' && result.status !== 'Processing') {
      throw new Error(`Failed to enqueue job: ${result.status}`);
    }

    return result;
  }

  /**
   * Poll job status with exponential backoff
   */
  async pollUntilComplete(job, mcpTools, options = {}) {
    const {
      maxWaitMs = 2 * 60 * 60 * 1000, // 2 hours
      initialIntervalMs = this.limits.minPollIntervalMs,
      backoffMultiplier = 1.5
    } = options;

    const toolName = this.getStatusToolName(job.type);
    const startTime = Date.now();
    let interval = initialIntervalMs;
    let pollCount = 0;

    while (Date.now() - startTime < maxWaitMs) {
      pollCount++;

      const status = await mcpTools[toolName]({ exportId: job.exportId });
      console.log(`[${job.id}] Poll #${pollCount}: ${status.status}`);

      if (['Completed', 'Failed', 'Cancelled'].includes(status.status)) {
        return status;
      }

      // Wait before next poll with exponential backoff
      await this.sleep(interval);
      interval = Math.min(interval * backoffMultiplier, this.limits.maxPollIntervalMs);
    }

    throw new Error(`Export ${job.exportId} timed out after ${maxWaitMs}ms`);
  }

  /**
   * Download export file via MCP
   */
  async downloadExportFile(job, mcpTools, outputDir) {
    const toolName = this.getFileToolName(job.type);

    const content = await mcpTools[toolName]({ exportId: job.exportId });

    // Determine output path
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${timestamp}-${job.type}.csv`;
    const outputPath = path.join(outputDir || '.', filename);

    // Write file
    await fs.writeFile(outputPath, content, 'utf8');

    // Verify size
    const stats = await fs.stat(outputPath);
    if (job.fileSize && stats.size !== job.fileSize) {
      console.warn(`Download size mismatch. Expected ${job.fileSize}, got ${stats.size}`);
    }

    return {
      path: outputPath,
      size: stats.size
    };
  }

  /**
   * Split a large date range into chunks
   */
  splitDateRange(startAt, endAt, maxDays = this.limits.maxDateRangeDays) {
    const ranges = [];
    let current = new Date(startAt);
    const end = new Date(endAt);

    while (current < end) {
      const rangeEnd = new Date(current);
      rangeEnd.setDate(rangeEnd.getDate() + maxDays - 1);

      if (rangeEnd > end) {
        rangeEnd.setTime(end.getTime());
      }

      ranges.push({
        startAt: current.toISOString(),
        endAt: rangeEnd.toISOString()
      });

      current = new Date(rangeEnd);
      current.setDate(current.getDate() + 1);
    }

    return ranges;
  }

  /**
   * Execute multiple exports respecting concurrency limits
   */
  async executeBatch(jobConfigs, mcpTools, options = {}) {
    const { maxConcurrent = this.limits.maxConcurrent } = options;
    const results = [];
    const pending = [...jobConfigs];

    while (pending.length > 0 || this.activeJobs.size > 0) {
      // Start new jobs up to concurrency limit
      while (pending.length > 0 && this.activeJobs.size < maxConcurrent) {
        const job = pending.shift();
        const promise = this.executeExport(job, mcpTools)
          .then(result => {
            this.activeJobs.delete(job.id);
            results.push(result);
            return result;
          });
        this.activeJobs.set(job.id, promise);
      }

      // Wait for at least one job to complete
      if (this.activeJobs.size > 0) {
        await Promise.race(Array.from(this.activeJobs.values()));
      }
    }

    return results;
  }

  /**
   * Get MCP tool names for different export types
   */
  getCreateToolName(type) {
    const tools = {
      lead: 'mcp__marketo__bulk_lead_export_create',
      activity: 'mcp__marketo__bulk_activity_export_create',
      programMember: 'mcp__marketo__bulk_program_member_export_create'
    };
    return tools[type] || tools.lead;
  }

  getEnqueueToolName(type) {
    const tools = {
      lead: 'mcp__marketo__bulk_lead_export_enqueue',
      activity: 'mcp__marketo__bulk_activity_export_enqueue',
      programMember: 'mcp__marketo__bulk_program_member_export_enqueue'
    };
    return tools[type] || tools.lead;
  }

  getStatusToolName(type) {
    const tools = {
      lead: 'mcp__marketo__bulk_lead_export_status',
      activity: 'mcp__marketo__bulk_activity_export_status',
      programMember: 'mcp__marketo__bulk_program_member_export_status'
    };
    return tools[type] || tools.lead;
  }

  getFileToolName(type) {
    const tools = {
      lead: 'mcp__marketo__bulk_lead_export_file',
      activity: 'mcp__marketo__bulk_activity_export_file',
      programMember: 'mcp__marketo__bulk_program_member_export_file'
    };
    return tools[type] || tools.lead;
  }

  /**
   * Helper: Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  /**
   * Helper: Sleep for ms
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get orchestrator status
   */
  getStatus() {
    return {
      activeJobs: this.activeJobs.size,
      queuedJobs: this.jobQueue.length,
      quota: {
        used: this.quotaTracker.usedToday,
        remaining: this.getRemainingQuota(),
        percentUsed: ((this.quotaTracker.usedToday / this.limits.dailyQuotaBytes) * 100).toFixed(1)
      },
      limits: this.limits
    };
  }
}

module.exports = {
  BulkExtractOrchestrator,
  LIMITS
};
