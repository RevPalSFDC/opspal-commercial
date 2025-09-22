#!/usr/bin/env node

/**
 * Salesforce Connector for Cross-Platform Operations
 * Provides unified interface for Salesforce data operations
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const EventEmitter = require('events');

class SalesforceConnector extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      orgAlias: process.env.SALESFORCE_ORG_ALIAS || config.orgAlias || 'production',
      apiVersion: config.apiVersion || '62.0',
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      batchSize: config.batchSize || 200,
      timeout: config.timeout || 30000,
      ...config
    };

    this.authenticated = false;
    this.orgInfo = null;
    this.rateLimiter = {
      requestCount: 0,
      resetTime: Date.now() + 24 * 60 * 60 * 1000,
      dailyLimit: 15000,
      concurrentLimit: 25
    };
  }

  /**
   * Authenticate with Salesforce org
   */
  async authenticate() {
    try {
      const { stdout } = await execAsync(
        `sf org display --target-org ${this.config.orgAlias} --json`
      );

      const result = JSON.parse(stdout);
      if (result.status === 0) {
        this.orgInfo = result.result;
        this.authenticated = true;
        this.emit('authenticated', this.orgInfo);
        return this.orgInfo;
      } else {
        throw new Error(`Authentication failed: ${result.message}`);
      }
    } catch (error) {
      this.emit('error', { type: 'authentication', error });
      throw error;
    }
  }

  /**
   * Execute SOQL query with pagination support
   */
  async query(soql, options = {}) {
    await this.ensureAuthenticated();
    await this.checkRateLimit();

    const allRecords = [];
    let nextRecordsUrl = null;
    let totalSize = 0;

    try {
      // Initial query
      const initialQuery = nextRecordsUrl
        ? `sf data query resume --resume-id "${nextRecordsUrl}" --json`
        : `sf data query --query "${soql}" --target-org ${this.config.orgAlias} --json`;

      const { stdout } = await execAsync(initialQuery);
      const result = JSON.parse(stdout);

      if (result.status !== 0) {
        throw new Error(`Query failed: ${result.message}`);
      }

      allRecords.push(...(result.result.records || []));
      totalSize = result.result.totalSize;
      nextRecordsUrl = result.result.nextRecordsUrl;

      // Handle pagination
      while (nextRecordsUrl && !options.limitResults) {
        const { stdout: nextStdout } = await execAsync(
          `sf data query resume --resume-id "${nextRecordsUrl}" --json`
        );
        const nextResult = JSON.parse(nextStdout);

        if (nextResult.status === 0) {
          allRecords.push(...(nextResult.result.records || []));
          nextRecordsUrl = nextResult.result.nextRecordsUrl;
        } else {
          break;
        }
      }

      this.incrementRateLimit();

      return {
        records: allRecords,
        totalSize: totalSize,
        done: !nextRecordsUrl
      };
    } catch (error) {
      this.emit('error', { type: 'query', soql, error });
      throw error;
    }
  }

  /**
   * Get object metadata
   */
  async describeObject(objectName) {
    await this.ensureAuthenticated();

    try {
      const { stdout } = await execAsync(
        `sf sobject describe --sobject ${objectName} --target-org ${this.config.orgAlias} --json`
      );

      const result = JSON.parse(stdout);
      if (result.status === 0) {
        return result.result;
      } else {
        throw new Error(`Describe failed: ${result.message}`);
      }
    } catch (error) {
      this.emit('error', { type: 'describe', objectName, error });
      throw error;
    }
  }

  /**
   * Create records with automatic batching
   */
  async createRecords(objectType, records, options = {}) {
    await this.ensureAuthenticated();

    const batches = this.createBatches(records, this.config.batchSize);
    const results = [];
    const errors = [];

    for (const [index, batch] of batches.entries()) {
      try {
        this.emit('batchStart', { index, total: batches.length, size: batch.length });

        // Create CSV file for bulk operation
        const csvContent = this.convertToCSV(batch);
        const tempFile = `/tmp/sf_create_${Date.now()}_${index}.csv`;
        require('fs').writeFileSync(tempFile, csvContent);

        const { stdout } = await execAsync(
          `sf data import bulk --sobject ${objectType} --file ${tempFile} --target-org ${this.config.orgAlias} --json`
        );

        const result = JSON.parse(stdout);
        results.push(...result.result);

        // Clean up temp file
        require('fs').unlinkSync(tempFile);

        this.emit('batchComplete', { index, results: result.result });
      } catch (error) {
        errors.push({ batch: index, error });
        this.emit('batchError', { index, error });
      }
    }

    return {
      success: results.filter(r => r.success),
      errors: [...results.filter(r => !r.success), ...errors]
    };
  }

  /**
   * Update records with automatic batching
   */
  async updateRecords(objectType, records, options = {}) {
    await this.ensureAuthenticated();

    const batches = this.createBatches(records, this.config.batchSize);
    const results = [];
    const errors = [];

    for (const [index, batch] of batches.entries()) {
      try {
        this.emit('batchStart', { index, total: batches.length, size: batch.length });

        // Create CSV file for bulk operation
        const csvContent = this.convertToCSV(batch);
        const tempFile = `/tmp/sf_update_${Date.now()}_${index}.csv`;
        require('fs').writeFileSync(tempFile, csvContent);

        const { stdout } = await execAsync(
          `sf data update bulk --sobject ${objectType} --file ${tempFile} --target-org ${this.config.orgAlias} --json`
        );

        const result = JSON.parse(stdout);
        results.push(...result.result);

        // Clean up temp file
        require('fs').unlinkSync(tempFile);

        this.emit('batchComplete', { index, results: result.result });
      } catch (error) {
        errors.push({ batch: index, error });
        this.emit('batchError', { index, error });
      }
    }

    return {
      success: results.filter(r => r.success),
      errors: [...results.filter(r => !r.success), ...errors]
    };
  }

  /**
   * Delete records
   */
  async deleteRecords(objectType, ids) {
    await this.ensureAuthenticated();

    const batches = this.createBatches(ids, this.config.batchSize);
    const results = [];

    for (const batch of batches) {
      try {
        const { stdout } = await execAsync(
          `sf data delete bulk --sobject ${objectType} --file - --target-org ${this.config.orgAlias} --json`,
          { input: batch.join('\n') }
        );

        const result = JSON.parse(stdout);
        results.push(...result.result);
      } catch (error) {
        this.emit('error', { type: 'delete', objectType, error });
      }
    }

    return results;
  }

  /**
   * Get field mappings for an object
   */
  async getFieldMappings(objectName) {
    const metadata = await this.describeObject(objectName);

    return metadata.fields.map(field => ({
      name: field.name,
      label: field.label,
      type: field.type,
      length: field.length,
      required: !field.nillable && !field.defaultedOnCreate,
      updateable: field.updateable,
      createable: field.createable,
      referenceTo: field.referenceTo,
      picklistValues: field.picklistValues
    }));
  }

  /**
   * Search for duplicate records
   */
  async findDuplicates(objectType, fields, options = {}) {
    await this.ensureAuthenticated();

    const matchThreshold = options.threshold || 0.8;
    const duplicates = [];

    // Build SOQL query
    const fieldList = fields.join(', ');
    const soql = `SELECT Id, ${fieldList} FROM ${objectType} WHERE ${fields[0]} != null LIMIT 10000`;

    const { records } = await this.query(soql);

    // Group potential duplicates
    const groups = this.groupPotentialDuplicates(records, fields, matchThreshold);

    return groups;
  }

  /**
   * Merge duplicate records
   */
  async mergeRecords(objectType, masterId, duplicateIds, options = {}) {
    await this.ensureAuthenticated();

    try {
      // Salesforce merge operation via API
      const mergeRequest = {
        masterRecord: masterId,
        recordsToMerge: duplicateIds
      };

      // Note: This would require REST API call
      // For now, returning structured merge plan
      return {
        status: 'pending',
        master: masterId,
        merged: duplicateIds,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.emit('error', { type: 'merge', error });
      throw error;
    }
  }

  // Helper methods

  async ensureAuthenticated() {
    if (!this.authenticated) {
      await this.authenticate();
    }
  }

  async checkRateLimit() {
    if (this.rateLimiter.requestCount >= this.rateLimiter.dailyLimit) {
      const waitTime = this.rateLimiter.resetTime - Date.now();
      if (waitTime > 0) {
        throw new Error(`Rate limit exceeded. Reset in ${Math.round(waitTime / 1000)} seconds`);
      } else {
        this.rateLimiter.requestCount = 0;
        this.rateLimiter.resetTime = Date.now() + 24 * 60 * 60 * 1000;
      }
    }
  }

  incrementRateLimit() {
    this.rateLimiter.requestCount++;
  }

  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  convertToCSV(records) {
    if (!records.length) return '';

    const headers = Object.keys(records[0]);
    const rows = records.map(record =>
      headers.map(header => {
        const value = record[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  groupPotentialDuplicates(records, fields, threshold) {
    const groups = [];
    const processed = new Set();

    for (let i = 0; i < records.length; i++) {
      if (processed.has(i)) continue;

      const group = [records[i]];
      processed.add(i);

      for (let j = i + 1; j < records.length; j++) {
        if (processed.has(j)) continue;

        const similarity = this.calculateSimilarity(records[i], records[j], fields);
        if (similarity >= threshold) {
          group.push(records[j]);
          processed.add(j);
        }
      }

      if (group.length > 1) {
        groups.push({
          records: group,
          matchFields: fields,
          confidence: this.calculateGroupConfidence(group, fields)
        });
      }
    }

    return groups;
  }

  calculateSimilarity(record1, record2, fields) {
    let totalScore = 0;
    let fieldCount = 0;

    for (const field of fields) {
      const val1 = (record1[field] || '').toString().toLowerCase();
      const val2 = (record2[field] || '').toString().toLowerCase();

      if (val1 && val2) {
        totalScore += this.levenshteinSimilarity(val1, val2);
        fieldCount++;
      }
    }

    return fieldCount > 0 ? totalScore / fieldCount : 0;
  }

  levenshteinSimilarity(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[str2.length][str1.length];
    const maxLength = Math.max(str1.length, str2.length);

    return maxLength > 0 ? 1 - (distance / maxLength) : 1;
  }

  calculateGroupConfidence(group, fields) {
    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < group.length - 1; i++) {
      for (let j = i + 1; j < group.length; j++) {
        totalSimilarity += this.calculateSimilarity(group[i], group[j], fields);
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }
}

module.exports = SalesforceConnector;