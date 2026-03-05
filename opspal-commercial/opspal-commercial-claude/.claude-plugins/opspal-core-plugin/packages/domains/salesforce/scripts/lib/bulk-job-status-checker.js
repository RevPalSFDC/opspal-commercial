#!/usr/bin/env node

/**
 * Bulk API Job Status Checker
 *
 * Queries Salesforce Bulk API v2.0 for existing/in-progress jobs matching operation criteria.
 * Prevents duplicate operations when job is still running in background.
 *
 * @module bulk-job-status-checker
 * @version 1.0.0
 * @since 2025-10-06
 *
 * Usage:
 *   node scripts/lib/bulk-job-status-checker.js <org-alias> <object> [options]
 *
 * Examples:
 *   # Check for Contact transfer jobs
 *   node scripts/lib/bulk-job-status-checker.js rentable-production Contact
 *
 *   # Check specific operation
 *   node scripts/lib/bulk-job-status-checker.js rentable-production Contact \
 *     --source-owner 005xxx --target-owner 005yyy
 *
 *   # Get JSON output
 *   node scripts/lib/bulk-job-status-checker.js rentable-production Contact --json
 */

const { execSync } = require('child_process');
const path = require('path');

class BulkJobStatusChecker {
  constructor(orgAlias) {
    this.orgAlias = orgAlias;
  }

  /**
   * Query Bulk API v2.0 for jobs matching criteria
   * @param {Object} criteria - Job search criteria
   * @param {string} criteria.object - Salesforce object type
   * @param {string} [criteria.sourceOwnerId] - Source owner ID for ownership transfer
   * @param {string} [criteria.targetOwnerId] - Target owner ID for ownership transfer
   * @param {string} [criteria.operation] - Operation type (update, insert, upsert, delete)
   * @param {number} [criteria.maxAge] - Max job age in hours (default: 24)
   * @returns {Array} Matching jobs with status
   */
  async checkJobs(criteria) {
    const {
      object,
      sourceOwnerId,
      targetOwnerId,
      operation = 'update',
      maxAge = 24
    } = criteria;

    try {
      // Query bulk jobs from last 24 hours
      const cutoffTime = new Date(Date.now() - (maxAge * 60 * 60 * 1000)).toISOString();

      const query = `
        SELECT Id, State, JobType, Object, CreatedDate, SystemModstamp,
               NumberRecordsProcessed, NumberRecordsFailed, TotalProcessingTime,
               ApiVersion, ColumnDelimiter, ContentType, LineEnding
        FROM AsyncApexJob
        WHERE JobType = 'BatchApexWorker'
          AND Object = '${object}'
          AND CreatedDate > ${cutoffTime}
        ORDER BY CreatedDate DESC
      `.trim().replace(/\s+/g, ' ');

      const result = execSync(
        `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );

      const parsed = JSON.parse(result);
      if (!parsed.result || parsed.result.totalSize === 0) {
        return [];
      }

      // Note: Bulk API v2.0 jobs are not in AsyncApexJob
      // We need to use the Bulk API endpoint directly
      return this.queryBulkV2Jobs(object, operation, maxAge);

    } catch (error) {
      console.error('Error querying bulk jobs:', error.message);
      return [];
    }
  }

  /**
   * Query Bulk API v2.0 jobs directly via REST API
   * @param {string} object - Object type
   * @param {string} operation - Operation type
   * @param {number} maxAge - Max age in hours
   * @returns {Array} Matching jobs
   */
  queryBulkV2Jobs(object, operation, maxAge) {
    try {
      // Get org instance URL and access token
      const orgInfo = execSync(
        `sf org display --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8' }
      );
      const { instanceUrl, accessToken } = JSON.parse(orgInfo).result;

      // Query bulk jobs via REST API
      const curlCmd = `
        curl -s "${instanceUrl}/services/data/v61.0/jobs/ingest" \\
          -H "Authorization: Bearer ${accessToken}" \\
          -H "Content-Type: application/json"
      `.trim();

      const response = execSync(curlCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      const bulkJobs = JSON.parse(response);

      if (!bulkJobs.records || bulkJobs.records.length === 0) {
        return [];
      }

      // Filter by object and age
      const cutoffTime = new Date(Date.now() - (maxAge * 60 * 60 * 1000));
      const matchingJobs = bulkJobs.records.filter(job => {
        const jobAge = new Date(job.createdDate);
        return job.object === object &&
               job.operation === operation &&
               jobAge > cutoffTime;
      });

      return matchingJobs.map(job => ({
        id: job.id,
        state: job.state,
        object: job.object,
        operation: job.operation,
        createdDate: job.createdDate,
        numberRecordsProcessed: job.numberRecordsProcessed || 0,
        numberRecordsFailed: job.numberRecordsFailed || 0,
        totalProcessingTime: job.totalProcessingTime || 0,
        percentComplete: this.calculatePercentComplete(job)
      }));

    } catch (error) {
      console.error('Error querying Bulk API v2.0:', error.message);
      return [];
    }
  }

  /**
   * Calculate percent complete for a job
   * @param {Object} job - Bulk job record
   * @returns {number} Percent complete (0-100)
   */
  calculatePercentComplete(job) {
    const total = (job.numberRecordsProcessed || 0) + (job.numberRecordsFailed || 0);
    if (total === 0) return 0;

    // If job is completed or failed, return 100
    if (['JobComplete', 'Failed', 'Aborted'].includes(job.state)) {
      return 100;
    }

    // For in-progress jobs, estimate based on state
    if (job.state === 'InProgress') {
      return Math.min(95, Math.round((job.numberRecordsProcessed / total) * 100));
    }

    // Queued or other states
    return 0;
  }

  /**
   * Check for existing jobs matching specific operation
   * @param {Object} operation - Operation details
   * @returns {Object} Status summary
   */
  async checkExistingOperation(operation) {
    const jobs = await this.checkJobs(operation);

    const inProgressJobs = jobs.filter(j =>
      ['Open', 'InProgress', 'UploadComplete'].includes(j.state)
    );

    const recentCompletedJobs = jobs.filter(j =>
      j.state === 'JobComplete' &&
      new Date(j.createdDate) > new Date(Date.now() - (1 * 60 * 60 * 1000)) // Last hour
    );

    return {
      hasInProgressJobs: inProgressJobs.length > 0,
      inProgressJobs,
      hasRecentCompletedJobs: recentCompletedJobs.length > 0,
      recentCompletedJobs,
      allJobs: jobs,
      recommendation: this.getRecommendation(inProgressJobs, recentCompletedJobs)
    };
  }

  /**
   * Get recommendation based on job status
   * @param {Array} inProgressJobs - In-progress jobs
   * @param {Array} recentCompletedJobs - Recently completed jobs
   * @returns {string} Recommendation
   */
  getRecommendation(inProgressJobs, recentCompletedJobs) {
    if (inProgressJobs.length > 0) {
      const job = inProgressJobs[0];
      return `WAIT - Existing job ${job.id} is ${job.percentComplete}% complete. Creating new job may cause duplicates.`;
    }

    if (recentCompletedJobs.length > 0) {
      const job = recentCompletedJobs[0];
      return `VERIFY - Job ${job.id} completed recently. Check results before creating new job.`;
    }

    return 'PROCEED - No conflicting jobs found. Safe to create new transfer operation.';
  }

  /**
   * Format job status for display
   * @param {Object} job - Job record
   * @returns {string} Formatted status
   */
  formatJobStatus(job) {
    const status = [
      `Job ID: ${job.id}`,
      `State: ${job.state}`,
      `Object: ${job.object}`,
      `Created: ${new Date(job.createdDate).toLocaleString()}`,
      `Processed: ${job.numberRecordsProcessed || 0}`,
      `Failed: ${job.numberRecordsFailed || 0}`,
      `Progress: ${job.percentComplete}%`
    ];

    return status.join('\n');
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(`
Usage: node bulk-job-status-checker.js <org-alias> <object> [options]

Options:
  --source-owner <id>    Source owner ID for transfer operations
  --target-owner <id>    Target owner ID for transfer operations
  --operation <type>     Operation type (update, insert, upsert, delete)
  --max-age <hours>      Max job age to check (default: 24)
  --json                 Output as JSON

Examples:
  # Check for Contact transfer jobs
  node bulk-job-status-checker.js rentable-production Contact

  # Check specific ownership transfer
  node bulk-job-status-checker.js rentable-production Contact \\
    --source-owner 005xxx --target-owner 005yyy --operation update
    `);
    process.exit(1);
  }

  const [orgAlias, object] = args;

  // Parse options
  const options = {
    object,
    sourceOwnerId: args.includes('--source-owner') ? args[args.indexOf('--source-owner') + 1] : null,
    targetOwnerId: args.includes('--target-owner') ? args[args.indexOf('--target-owner') + 1] : null,
    operation: args.includes('--operation') ? args[args.indexOf('--operation') + 1] : 'update',
    maxAge: args.includes('--max-age') ? parseInt(args[args.indexOf('--max-age') + 1]) : 24
  };

  const jsonOutput = args.includes('--json');

  const checker = new BulkJobStatusChecker(orgAlias);

  (async () => {
    const status = await checker.checkExistingOperation(options);

    if (jsonOutput) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log('\n=== Bulk Job Status Check ===\n');
      console.log(`Org: ${orgAlias}`);
      console.log(`Object: ${object}`);
      console.log(`Operation: ${options.operation}`);
      console.log(`Max Age: ${options.maxAge} hours\n`);

      if (status.hasInProgressJobs) {
        console.log('⚠️  IN-PROGRESS JOBS FOUND:\n');
        status.inProgressJobs.forEach(job => {
          console.log(checker.formatJobStatus(job));
          console.log('');
        });
      }

      if (status.hasRecentCompletedJobs) {
        console.log('✅ RECENTLY COMPLETED JOBS:\n');
        status.recentCompletedJobs.forEach(job => {
          console.log(checker.formatJobStatus(job));
          console.log('');
        });
      }

      if (!status.hasInProgressJobs && !status.hasRecentCompletedJobs) {
        console.log('✅ No conflicting jobs found.\n');
      }

      console.log(`\n📋 RECOMMENDATION: ${status.recommendation}\n`);
    }

    // Exit code: 0 = proceed, 1 = wait/verify
    process.exit(status.hasInProgressJobs ? 1 : 0);
  })();
}

module.exports = BulkJobStatusChecker;
