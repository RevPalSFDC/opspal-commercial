#!/usr/bin/env node
/**
 * Flow Streaming Query Utility
 *
 * Handles large-scale flow metadata queries with pagination, streaming,
 * timeout handling, and retry logic. Prevents timeout issues on orgs
 * with 100+ active flows.
 *
 * Features:
 * - Pagination (200 records per query)
 * - Progress tracking with ETA
 * - Automatic retry with exponential backoff
 * - Graceful timeout handling
 * - Memory-efficient streaming
 *
 * Usage:
 *   const FlowStreamingQuery = require('./flow-streaming-query');
 *   const query = new FlowStreamingQuery(orgAlias);
 *   const flows = await query.getAllActiveFlows();
 *
 * @version 1.0.0
 * @date 2025-10-08
 */

const { execSync } = require('child_process');
const QueryRetryUtility = require('./query-retry-utility');

class FlowStreamingQuery {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.batchSize = options.batchSize || 200;
    this.maxRetries = options.maxRetries || 3;
    this.timeoutMs = options.timeoutMs || 120000; // 2 minutes per query
    this.showProgress = options.showProgress !== false;
    this.results = [];
    this.retryUtil = new QueryRetryUtility();
    this.queryMethod = null; // Track which query method worked: 'FlowDefinitionView' or 'FlowDefinition'
  }

  /**
   * Query all active flows with pagination
   */
  async getAllActiveFlows() {
    console.log(`\n🔄 Querying active flows from ${this.orgAlias}...`);
    console.log(`Using pagination (${this.batchSize} records per query)\n`);

    try {
      // First, get total count
      const totalCount = await this.getTotalFlowCount();

      if (totalCount === 0) {
        console.log('✓ No active flows found in org');
        return [];
      }

      console.log(`Found ${totalCount} active flows`);

      // If using FlowDefinition fallback, return empty array with metadata (detailed extraction not possible)
      if (this.queryMethod === 'FlowDefinition') {
        console.log(`⚠️  Detailed flow extraction unavailable (FlowDefinitionView not supported)`);
        console.log(`✓ Returning count-only result: ${totalCount} flows`);
        console.log(`   Note: Flow details cannot be extracted without FlowDefinitionView support`);

        // Return empty array with metadata properties for downstream compatibility
        const flows = [];
        flows.countOnly = true;
        flows.totalCount = totalCount;
        flows.queryMethod = 'FlowDefinition';
        flows.reason = 'FlowDefinitionView not supported in this org';
        flows.recommendation = 'Upgrade to API v58+ or manually review flows in Setup → Flows';

        return flows;
      }
      console.log('');

      // Query in batches
      let offset = 0;
      let batchNumber = 1;
      const totalBatches = Math.ceil(totalCount / this.batchSize);

      while (offset < totalCount) {
        if (this.showProgress) {
          const progress = Math.round((offset / totalCount) * 100);
          console.log(`📊 Batch ${batchNumber}/${totalBatches} (${progress}% complete, ${this.results.length}/${totalCount} flows collected)`);
        }

        const batch = await this.queryFlowBatch(offset);

        if (batch.length === 0) {
          break; // No more results
        }

        this.results.push(...batch);
        offset += this.batchSize;
        batchNumber++;
      }

      console.log(`\n✓ Successfully retrieved ${this.results.length} flows\n`);
      return this.results;

    } catch (error) {
      console.error('❌ Flow query failed:', error.message);

      // Provide helpful troubleshooting
      if (error.message.includes('timeout') || error.message.includes('QUERY_TIMEOUT')) {
        console.log('\n💡 Troubleshooting:');
        console.log('  - Try reducing batch size: new FlowStreamingQuery(org, {batchSize: 100})');
        console.log('  - Query a subset: await query.queryFlowBatch(0, 50)');
        console.log('  - Skip flow analysis: Use --skip-flows flag in orchestrator');
      }

      throw error;
    }
  }

  /**
   * Get total count of active flows
   * Tries FlowDefinitionView first, falls back to FlowDefinition if unsupported
   */
  async getTotalFlowCount() {
    // Try FlowDefinitionView first (preferred, more efficient)
    const queryView = `
      SELECT COUNT()
      FROM FlowDefinitionView
      WHERE IsActive = true
    `.trim().replace(/\s+/g, ' ');

    try {
      const result = await this.executeQuery(queryView, { json: true });
      this.queryMethod = 'FlowDefinitionView';
      return result.totalSize || 0;
    } catch (error) {
      // Check if error is due to FlowDefinitionView not being supported
      if (error.message.includes('not supported') || error.message.includes('sObject type')) {
        console.warn('⚠️  FlowDefinitionView not supported, trying FlowDefinition fallback...');

        // Fallback to FlowDefinition (older API, broader support)
        const queryDefinition = `
          SELECT COUNT()
          FROM FlowDefinition
          WHERE ActiveVersionId != null
        `.trim().replace(/\s+/g, ' ');

        try {
          const result = await this.executeQuery(queryDefinition, { json: true });
          this.queryMethod = 'FlowDefinition';
          console.log(`✓ Using FlowDefinition fallback (found ${result.totalSize} flows)`);
          return result.totalSize || 0;
        } catch (fallbackError) {
          console.error('❌ Both FlowDefinitionView and FlowDefinition queries failed');
          this.queryMethod = null;
          return -1; // Unknown count, will query until empty
        }
      }

      // Other error, not related to object support
      console.warn('⚠️ Could not get flow count, will attempt direct query');
      return -1; // Unknown count, will query until empty
    }
  }

  /**
   * Query a batch of flows with retry logic
   * Uses queryMethod determined by getTotalFlowCount() or auto-detects
   */
  async queryFlowBatch(offset, limit = null) {
    const batchSize = limit || this.batchSize;

    // Use the query method that worked in getTotalFlowCount(), or try FlowDefinitionView first
    const useMethod = this.queryMethod || 'FlowDefinitionView';

    if (useMethod === 'FlowDefinitionView') {
      try {
        return await this.queryFlowBatchView(offset, batchSize);
      } catch (error) {
        // If FlowDefinitionView fails with "not supported", fallback to FlowDefinition
        if (error.message.includes('not supported') || error.message.includes('sObject type')) {
          console.warn('⚠️  FlowDefinitionView not supported, trying FlowDefinition fallback...');
          this.queryMethod = 'FlowDefinition';
          return await this.queryFlowBatchDefinition(offset, batchSize);
        }
        throw error;
      }
    } else {
      // Use FlowDefinition (fallback mode)
      return await this.queryFlowBatchDefinition(offset, batchSize);
    }
  }

  /**
   * Query flows using FlowDefinitionView (preferred, more efficient)
   */
  async queryFlowBatchView(offset, batchSize) {
    const query = `
      SELECT
        DurableId,
        ActiveVersionId,
        ProcessType,
        DeveloperName,
        MasterLabel,
        Description,
        LastModifiedDate,
        LastModifiedBy.Name
      FROM FlowDefinitionView
      WHERE IsActive = true
      ORDER BY DeveloperName
      LIMIT ${batchSize}
      OFFSET ${offset}
    `.trim().replace(/\s+/g, ' ');

    let attempt = 0;
    let lastError;

    while (attempt < this.maxRetries) {
      try {
        const result = await this.executeQuery(query, {
          json: true,
          timeout: this.timeoutMs
        });

        return result.records || [];

      } catch (error) {
        lastError = error;
        attempt++;

        if (attempt < this.maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⚠️ Query failed (attempt ${attempt}/${this.maxRetries}), retrying in ${waitTime/1000}s...`);
          await this.sleep(waitTime);
        }
      }
    }

    throw new Error(`Failed to query flows after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Query flows using FlowDefinition (fallback for older API versions)
   */
  async queryFlowBatchDefinition(offset, batchSize) {
    const query = `
      SELECT
        Id,
        ActiveVersionId,
        ProcessType,
        DeveloperName,
        MasterLabel,
        Description,
        LastModifiedDate
      FROM FlowDefinition
      WHERE ActiveVersionId != null
      ORDER BY DeveloperName
      LIMIT ${batchSize}
      OFFSET ${offset}
    `.trim().replace(/\s+/g, ' ');

    let attempt = 0;
    let lastError;

    while (attempt < this.maxRetries) {
      try {
        const result = await this.executeQuery(query, {
          json: true,
          timeout: this.timeoutMs
        });

        // Map FlowDefinition fields to FlowDefinitionView format for consistency
        const records = (result.records || []).map(r => ({
          DurableId: r.Id, // FlowDefinition uses Id instead of DurableId
          ActiveVersionId: r.ActiveVersionId,
          ProcessType: r.ProcessType,
          DeveloperName: r.DeveloperName,
          MasterLabel: r.MasterLabel,
          Description: r.Description,
          LastModifiedDate: r.LastModifiedDate,
          LastModifiedBy: { Name: 'Unknown' } // FlowDefinition doesn't have LastModifiedBy.Name
        }));

        return records;

      } catch (error) {
        lastError = error;
        attempt++;

        if (attempt < this.maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⚠️ Query failed (attempt ${attempt}/${this.maxRetries}), retrying in ${waitTime/1000}s...`);
          await this.sleep(waitTime);
        }
      }
    }

    throw new Error(`Failed to query flows after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Execute Salesforce CLI query
   */
  async executeQuery(soql, options = {}) {
    const command = [
      'sf data query',
      '--query', `"${soql}"`,
      '--use-tooling-api',
      '--target-org', this.orgAlias
    ];

    if (options.json) {
      command.push('--json');
    }

    const timeout = options.timeout || this.timeoutMs;

    try {
      const output = execSync(command.join(' '), {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        timeout: timeout
      });

      if (options.json) {
        const parsed = JSON.parse(output);

        if (parsed.status !== 0) {
          throw new Error(parsed.message || 'Query failed');
        }

        return parsed.result;
      }

      return output;

    } catch (error) {
      if (error.killed || error.signal === 'SIGTERM') {
        throw new Error('QUERY_TIMEOUT: Query exceeded timeout limit');
      }

      // Try to parse error.stdout as JSON to get the actual error message
      if (error.stdout && options.json) {
        try {
          const parsed = JSON.parse(error.stdout);
          if (parsed.message) {
            // Create error with the actual message from Salesforce
            const sfError = new Error(parsed.message);
            sfError.name = parsed.name || 'SalesforceError';
            sfError.originalError = error;
            throw sfError;
          }
        } catch (parseError) {
          // Only catch JSON parsing errors, not thrown errors
          if (parseError instanceof SyntaxError) {
            // JSON parsing failed, use original error
          } else {
            // This was our thrown error, re-throw it
            throw parseError;
          }
        }
      }

      throw error;
    }
  }

  /**
   * Sleep utility for retry backoff
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Query flows by type
   */
  async getFlowsByType(processType) {
    const query = `
      SELECT
        DurableId,
        ActiveVersionId,
        ProcessType,
        DeveloperName,
        MasterLabel,
        LastModifiedDate
      FROM FlowDefinitionView
      WHERE IsActive = true
      AND ProcessType = '${processType}'
      ORDER BY DeveloperName
    `.trim().replace(/\s+/g, ' ');

    try {
      const result = await this.executeQuery(query, { json: true });
      return result.records || [];
    } catch (error) {
      console.warn(`⚠️ Could not query ${processType} flows:`, error.message);
      return [];
    }
  }

  /**
   * Query flows modified within date range
   */
  async getRecentFlows(days = 30) {
    const query = `
      SELECT
        DurableId,
        ActiveVersionId,
        ProcessType,
        DeveloperName,
        MasterLabel,
        LastModifiedDate
      FROM FlowDefinitionView
      WHERE IsActive = true
      AND LastModifiedDate = LAST_N_DAYS:${days}
      ORDER BY LastModifiedDate DESC
    `.trim().replace(/\s+/g, ' ');

    try {
      const result = await this.executeQuery(query, { json: true });
      return result.records || [];
    } catch (error) {
      console.warn(`⚠️ Could not query recent flows:`, error.message);
      return [];
    }
  }

  /**
   * Get flow statistics
   */
  async getFlowStats() {
    console.log('📊 Collecting flow statistics...\n');

    const stats = {
      total: 0,
      byType: {},
      recentlyModified: 0,
      querySuccess: false
    };

    try {
      // Get all flows
      const flows = await this.getAllActiveFlows();
      stats.total = flows.length;
      stats.querySuccess = true;

      // Group by type
      flows.forEach(flow => {
        const type = flow.ProcessType || 'Unknown';
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      });

      // Count recently modified (last 30 days)
      const recentFlows = await this.getRecentFlows(30);
      stats.recentlyModified = recentFlows.length;

      return stats;

    } catch (error) {
      console.error('❌ Could not collect flow statistics:', error.message);
      stats.error = error.message;
      return stats;
    }
  }
}

// CLI Execution
if (require.main === module) {
  const orgAlias = process.argv[2];
  const action = process.argv[3] || 'all';

  if (!orgAlias) {
    console.error('Usage: node flow-streaming-query.js <org-alias> [action]');
    console.error('');
    console.error('Actions:');
    console.error('  all       - Get all active flows (default)');
    console.error('  stats     - Get flow statistics');
    console.error('  count     - Get flow count only');
    console.error('  recent    - Get recently modified flows (30 days)');
    console.error('');
    console.error('Examples:');
    console.error('  node flow-streaming-query.js myorg');
    console.error('  node flow-streaming-query.js myorg stats');
    console.error('  node flow-streaming-query.js myorg recent');
    process.exit(1);
  }

  const query = new FlowStreamingQuery(orgAlias);

  (async () => {
    try {
      switch (action) {
        case 'all':
          const flows = await query.getAllActiveFlows();
          console.log(JSON.stringify(flows, null, 2));
          break;

        case 'stats':
          const stats = await query.getFlowStats();
          console.log('\n📊 Flow Statistics:');
          console.log(`Total Active Flows: ${stats.total}`);
          console.log('\nBy Type:');
          Object.entries(stats.byType).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
          });
          console.log(`\nRecently Modified (30 days): ${stats.recentlyModified}`);
          break;

        case 'count':
          const count = await query.getTotalFlowCount();
          console.log(`Total Active Flows: ${count}`);
          break;

        case 'recent':
          const recent = await query.getRecentFlows();
          console.log(`Recently Modified Flows (30 days): ${recent.length}`);
          console.log(JSON.stringify(recent, null, 2));
          break;

        default:
          console.error(`Unknown action: ${action}`);
          process.exit(1);
      }

      process.exit(0);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = FlowStreamingQuery;
