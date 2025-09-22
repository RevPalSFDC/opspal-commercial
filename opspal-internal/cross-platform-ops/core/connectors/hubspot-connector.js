#!/usr/bin/env node

/**
 * HubSpot Connector for Cross-Platform Operations
 * Provides unified interface for HubSpot data operations
 */

const EventEmitter = require('events');

class HubSpotConnector extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      apiKey: process.env.HUBSPOT_API_KEY || config.apiKey,
      portalId: process.env.HUBSPOT_PORTAL_ID || config.portalId,
      apiVersion: config.apiVersion || 'v3',
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      batchSize: config.batchSize || 100,
      timeout: config.timeout || 30000,
      baseUrl: 'https://api.hubapi.com',
      ...config
    };

    this.authenticated = false;
    this.accountInfo = null;
    this.rateLimiter = {
      requestCount: 0,
      resetTime: Date.now() + 10000, // 10 second window
      tenSecondLimit: 100,
      dailyLimit: 500000,
      dailyCount: 0,
      dailyResetTime: Date.now() + 24 * 60 * 60 * 1000
    };
  }

  /**
   * Authenticate with HubSpot API
   */
  async authenticate() {
    if (!this.config.apiKey) {
      throw new Error('HubSpot API key is required');
    }

    try {
      // Test authentication by getting account info
      // Use the correct endpoint for OAuth tokens
      const response = await this.makeRequest('/account-info/v3/details');

      if (response) {
        this.authenticated = true;
        this.accountInfo = response;
        this.emit('authenticated', this.accountInfo);
        return this.accountInfo;
      }
    } catch (error) {
      this.emit('error', { type: 'authentication', error });
      throw error;
    }
  }

  /**
   * Make API request with rate limiting and retry logic
   */
  async makeRequest(endpoint, options = {}) {
    await this.checkRateLimit();

    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    let retries = 0;
    while (retries < this.config.maxRetries) {
      try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(url, {
          method: options.method || 'GET',
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          timeout: this.config.timeout
        });

        this.incrementRateLimit();

        if (response.ok) {
          return await response.json();
        } else if (response.status === 429) {
          // Rate limited, wait and retry
          const retryAfter = response.headers.get('Retry-After') || 10;
          await this.wait(retryAfter * 1000);
          retries++;
        } else {
          const error = await response.text();
          throw new Error(`HubSpot API error: ${response.status} - ${error}`);
        }
      } catch (error) {
        if (retries >= this.config.maxRetries - 1) {
          throw error;
        }
        retries++;
        await this.wait(this.config.retryDelay * retries);
      }
    }
  }

  /**
   * Search for records with pagination
   */
  async searchRecords(objectType, criteria = {}, options = {}) {
    await this.ensureAuthenticated();

    const allRecords = [];
    let after = null;
    let hasMore = true;

    const searchBody = {
      filterGroups: criteria.filterGroups || [],
      sorts: criteria.sorts || [],
      properties: criteria.properties || [],
      limit: Math.min(options.limit || 100, 100)
    };

    while (hasMore) {
      if (after) {
        searchBody.after = after;
      }

      try {
        const response = await this.makeRequest(
          `/crm/v3/objects/${objectType}/search`,
          {
            method: 'POST',
            body: searchBody
          }
        );

        allRecords.push(...(response.results || []));

        if (response.paging && response.paging.next) {
          after = response.paging.next.after;
        } else {
          hasMore = false;
        }

        // Stop if we've reached the requested limit
        if (options.maxRecords && allRecords.length >= options.maxRecords) {
          hasMore = false;
          allRecords.splice(options.maxRecords);
        }
      } catch (error) {
        this.emit('error', { type: 'search', objectType, error });
        throw error;
      }
    }

    return {
      records: allRecords,
      totalSize: allRecords.length
    };
  }

  /**
   * Get object schema
   */
  async describeObject(objectType) {
    await this.ensureAuthenticated();

    try {
      const response = await this.makeRequest(`/crm/v3/schemas/${objectType}`);
      return response;
    } catch (error) {
      this.emit('error', { type: 'describe', objectType, error });
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

        const inputs = batch.map(record => ({
          properties: record
        }));

        const response = await this.makeRequest(
          `/crm/v3/objects/${objectType}/batch/create`,
          {
            method: 'POST',
            body: { inputs }
          }
        );

        results.push(...(response.results || []));
        if (response.errors) {
          errors.push(...response.errors);
        }

        this.emit('batchComplete', { index, results: response.results });
      } catch (error) {
        errors.push({ batch: index, error });
        this.emit('batchError', { index, error });
      }
    }

    return {
      success: results,
      errors: errors
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

        const inputs = batch.map(record => ({
          id: record.id,
          properties: record
        }));

        const response = await this.makeRequest(
          `/crm/v3/objects/${objectType}/batch/update`,
          {
            method: 'POST',
            body: { inputs }
          }
        );

        results.push(...(response.results || []));
        if (response.errors) {
          errors.push(...response.errors);
        }

        this.emit('batchComplete', { index, results: response.results });
      } catch (error) {
        errors.push({ batch: index, error });
        this.emit('batchError', { index, error });
      }
    }

    return {
      success: results,
      errors: errors
    };
  }

  /**
   * Delete records
   */
  async deleteRecords(objectType, ids) {
    await this.ensureAuthenticated();

    const batches = this.createBatches(ids, this.config.batchSize);
    const results = [];
    const errors = [];

    for (const batch of batches) {
      try {
        const inputs = batch.map(id => ({ id }));

        const response = await this.makeRequest(
          `/crm/v3/objects/${objectType}/batch/archive`,
          {
            method: 'POST',
            body: { inputs }
          }
        );

        if (response.results) {
          results.push(...response.results);
        }
        if (response.errors) {
          errors.push(...response.errors);
        }
      } catch (error) {
        errors.push({ error });
        this.emit('error', { type: 'delete', objectType, error });
      }
    }

    return {
      success: results,
      errors: errors
    };
  }

  /**
   * Get field mappings for an object
   */
  async getFieldMappings(objectType) {
    const schema = await this.describeObject(objectType);

    return schema.properties.map(property => ({
      name: property.name,
      label: property.label,
      type: property.type,
      fieldType: property.fieldType,
      required: property.required || false,
      updateable: !property.readOnlyValue,
      createable: !property.readOnlyDefinition,
      options: property.options || [],
      description: property.description
    }));
  }

  /**
   * Find duplicate records
   */
  async findDuplicates(objectType, fields, options = {}) {
    await this.ensureAuthenticated();

    const matchThreshold = options.threshold || 0.8;
    const duplicates = [];

    // Get all records with specified fields
    const { records } = await this.searchRecords(
      objectType,
      {
        properties: ['id', ...fields],
        limit: 100
      },
      { maxRecords: options.maxRecords || 10000 }
    );

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
      // HubSpot merge operation
      const response = await this.makeRequest(
        `/crm/v3/objects/${objectType}/merge`,
        {
          method: 'POST',
          body: {
            primaryObjectId: masterId,
            objectIdsToMerge: duplicateIds
          }
        }
      );

      return {
        status: 'completed',
        master: masterId,
        merged: duplicateIds,
        result: response,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.emit('error', { type: 'merge', error });
      throw error;
    }
  }

  /**
   * Get associations between objects
   */
  async getAssociations(objectType, objectId, toObjectType) {
    await this.ensureAuthenticated();

    try {
      const response = await this.makeRequest(
        `/crm/v3/objects/${objectType}/${objectId}/associations/${toObjectType}`
      );

      return response.results || [];
    } catch (error) {
      this.emit('error', { type: 'associations', error });
      throw error;
    }
  }

  /**
   * Create associations between objects
   */
  async createAssociation(fromObject, toObject, associationType) {
    await this.ensureAuthenticated();

    try {
      const response = await this.makeRequest(
        `/crm/v3/objects/${fromObject.type}/${fromObject.id}/associations/${toObject.type}/${toObject.id}/${associationType}`,
        { method: 'PUT' }
      );

      return response;
    } catch (error) {
      this.emit('error', { type: 'association', error });
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
    const now = Date.now();

    // Reset 10-second counter if needed
    if (now >= this.rateLimiter.resetTime) {
      this.rateLimiter.requestCount = 0;
      this.rateLimiter.resetTime = now + 10000;
    }

    // Reset daily counter if needed
    if (now >= this.rateLimiter.dailyResetTime) {
      this.rateLimiter.dailyCount = 0;
      this.rateLimiter.dailyResetTime = now + 24 * 60 * 60 * 1000;
    }

    // Check 10-second limit
    if (this.rateLimiter.requestCount >= this.rateLimiter.tenSecondLimit) {
      const waitTime = this.rateLimiter.resetTime - now;
      await this.wait(waitTime);
      this.rateLimiter.requestCount = 0;
    }

    // Check daily limit
    if (this.rateLimiter.dailyCount >= this.rateLimiter.dailyLimit) {
      throw new Error('Daily API limit reached');
    }
  }

  incrementRateLimit() {
    this.rateLimiter.requestCount++;
    this.rateLimiter.dailyCount++;
  }

  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

        const similarity = this.calculateSimilarity(
          records[i].properties,
          records[j].properties,
          fields
        );

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
        totalSimilarity += this.calculateSimilarity(
          group[i].properties,
          group[j].properties,
          fields
        );
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }
}

module.exports = HubSpotConnector;