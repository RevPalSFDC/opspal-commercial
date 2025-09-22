#!/usr/bin/env node
/**
 * SOQL Query Pipeline - Unified, secure, and performant query execution
 *
 * This module consolidates all SOQL query handling into a single pipeline with:
 * - Security-first design with input validation
 * - Async/await architecture for performance
 * - Multiple execution strategies (MCP, CLI, API)
 * - Comprehensive error recovery and field mapping
 * - Full audit trail and monitoring
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

// Import validation patterns from existing modules
const { TOOLING_OBJECTS } = require('./soql-guard');

/**
 * Security configuration and limits
 */
const SECURITY_CONFIG = {
  maxQueryLength: 10000,
  maxExecutionTime: 30000, // 30 seconds
  maxRetries: 3,
  allowedObjectPattern: /^[A-Za-z_][A-Za-z0-9_]*$/,
  allowedFieldPattern: /^[A-Za-z_][A-Za-z0-9_]*(__[cCrR])?$/,
  forbiddenPatterns: [
    /;\s*DELETE\s+/i,
    /;\s*UPDATE\s+/i,
    /;\s*INSERT\s+/i,
    /;\s*DROP\s+/i,
    /;\s*CREATE\s+/i,
    /;\s*ALTER\s+/i
  ]
};

/**
 * Performance configuration
 */
const PERFORMANCE_CONFIG = {
  cacheEnabled: true,
  cacheTTL: 300000, // 5 minutes
  batchSize: 100,
  connectionPoolSize: 5,
  precompileRegex: true
};

/**
 * Execution strategies enum
 */
const ExecutionStrategy = {
  MCP: 'MCP',
  CLI: 'CLI',
  API: 'API'
};

/**
 * Query execution result
 */
class QueryResult {
  constructor(data = {}) {
    this.success = data.success || false;
    this.data = data.data || null;
    this.metadata = {
      queryId: data.queryId || crypto.randomUUID(),
      timestamp: data.timestamp || new Date().toISOString(),
      strategy: data.strategy || 'UNKNOWN',
      executionTime: data.executionTime || 0,
      dataSource: data.dataSource || 'UNKNOWN',
      recordCount: data.recordCount || 0,
      cached: data.cached || false,
      ...data.metadata
    };
    this.error = data.error || null;
    this.warnings = data.warnings || [];
  }

  /**
   * Get data source label for display
   */
  getDataSourceLabel() {
    const labels = {
      'MCP_VERIFIED': '✅ VERIFIED - Live data via MCP',
      'CLI_VERIFIED': '✅ VERIFIED - Live data via CLI',
      'API_VERIFIED': '✅ VERIFIED - Live data via API',
      'CACHED': '⚡ CACHED - Previously verified data',
      'FAILED': '❌ FAILED - Query execution failed',
      'UNKNOWN': '❓ UNKNOWN - Data source undetermined'
    };
    return labels[this.metadata.dataSource] || labels.UNKNOWN;
  }
}

/**
 * Main SOQL Query Pipeline
 */
class SOQLQueryPipeline extends EventEmitter {
  constructor(config = {}) {
    super();

    // Merge configurations
    this.config = {
      ...SECURITY_CONFIG,
      ...PERFORMANCE_CONFIG,
      ...config
    };

    // Initialize components
    this.cache = new Map();
    this.fieldMappings = new Map();
    this.compiledPatterns = new Map();
    this.connectionPool = [];
    this.metrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      cacheHits: 0,
      averageExecutionTime: 0
    };

    // Load configurations
    this.loadFieldMappings();
    this.precompilePatterns();
  }

  /**
   * Main execution method - processes query through full pipeline
   */
  async execute(query, options = {}) {
    const startTime = Date.now();
    const queryId = crypto.randomUUID();

    this.emit('query:start', { queryId, query });
    this.metrics.totalQueries++;

    try {
      // Layer 1: Input validation
      await this.validateInput(query, options);

      // Layer 2: Check cache
      const cached = await this.checkCache(query, options);
      if (cached) {
        this.metrics.cacheHits++;
        cached.metadata.cached = true;
        this.emit('query:cached', { queryId, result: cached });
        return cached;
      }

      // Layer 3: Query preparation (field mapping, syntax fixing)
      const prepared = await this.prepareQuery(query, options);

      // Layer 4: Execute with strategy selection
      const result = await this.executeWithStrategy(prepared, options);

      // Layer 5: Validate result integrity
      await this.validateResult(result);

      // Layer 6: Cache successful results
      if (result.success && this.config.cacheEnabled) {
        await this.cacheResult(query, result);
      }

      // Update metrics
      result.metadata.queryId = queryId;
      result.metadata.executionTime = Date.now() - startTime;
      this.updateMetrics(result);

      // Emit completion event
      this.emit('query:complete', { queryId, result });

      return result;

    } catch (error) {
      // Handle errors with full context
      const result = new QueryResult({
        success: false,
        error: error.message,
        queryId,
        executionTime: Date.now() - startTime,
        dataSource: 'FAILED'
      });

      this.metrics.failedQueries++;
      this.emit('query:error', { queryId, error });

      // Re-throw in strict mode
      if (options.strictMode !== false) {
        throw error;
      }

      return result;
    }
  }

  /**
   * Layer 1: Input validation and security checks
   */
  async validateInput(query, options) {
    // Check query length
    if (query.length > this.config.maxQueryLength) {
      throw new Error(`Query exceeds maximum length of ${this.config.maxQueryLength} characters`);
    }

    // Check for SQL injection patterns
    for (const pattern of this.config.forbiddenPatterns) {
      if (pattern.test(query)) {
        throw new Error(`Query contains forbidden pattern: ${pattern}`);
      }
    }

    // Validate it's a SELECT query
    if (!query.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error('Only SELECT queries are allowed');
    }

    // Extract and validate object names
    const objects = this.extractObjects(query);
    for (const obj of objects) {
      if (!this.config.allowedObjectPattern.test(obj)) {
        throw new Error(`Invalid object name: ${obj}`);
      }
    }

    // Validate field names if strict validation is enabled
    if (options.strictFieldValidation) {
      const fields = this.extractFields(query);
      for (const field of fields) {
        if (!this.config.allowedFieldPattern.test(field)) {
          throw new Error(`Invalid field name: ${field}`);
        }
      }
    }

    return true;
  }

  /**
   * Layer 2: Check cache for results
   */
  async checkCache(query, options) {
    if (!this.config.cacheEnabled || options.skipCache) {
      return null;
    }

    const cacheKey = this.getCacheKey(query, options);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
      return cached.result;
    }

    // Clear expired cache entry
    if (cached) {
      this.cache.delete(cacheKey);
    }

    return null;
  }

  /**
   * Layer 3: Prepare query with field mapping and syntax fixes
   */
  async prepareQuery(query, options) {
    let prepared = query;

    // Fix common syntax issues
    prepared = this.fixQuerySyntax(prepared);

    // Apply field mappings if available
    if (options.targetOrg && this.fieldMappings.has(options.targetOrg)) {
      prepared = await this.applyFieldMappings(prepared, options.targetOrg);
    }

    // Detect if Tooling API is needed
    const needsToolingApi = this.detectToolingApi(prepared);

    return {
      original: query,
      query: prepared,
      needsToolingApi,
      targetOrg: options.targetOrg
    };
  }

  /**
   * Layer 4: Execute with strategy selection
   */
  async executeWithStrategy(prepared, options) {
    const strategies = this.determineStrategies(options);
    let lastError = null;

    for (const strategy of strategies) {
      try {
        this.emit('strategy:attempt', { strategy, query: prepared.query });

        switch (strategy) {
          case ExecutionStrategy.MCP:
            return await this.executeMCP(prepared, options);
          case ExecutionStrategy.CLI:
            return await this.executeCLI(prepared, options);
          case ExecutionStrategy.API:
            return await this.executeAPI(prepared, options);
          default:
            throw new Error(`Unknown execution strategy: ${strategy}`);
        }
      } catch (error) {
        lastError = error;
        this.emit('strategy:failed', { strategy, error: error.message });

        // Continue to next strategy
        if (strategies.indexOf(strategy) < strategies.length - 1) {
          continue;
        }
      }
    }

    // All strategies failed
    throw lastError || new Error('All execution strategies failed');
  }

  /**
   * Execute via MCP tools
   */
  async executeMCP(prepared, options) {
    // Check MCP availability
    const mcpAvailable = await this.checkMCPAvailability();
    if (!mcpAvailable) {
      throw new Error('MCP tools not available');
    }

    // TODO: Implement actual MCP tool invocation
    // This is a placeholder for MCP integration
    throw new Error('MCP execution not yet implemented');
  }

  /**
   * Execute via SF CLI (secure async implementation)
   */
  async executeCLI(prepared, options) {
    return new Promise((resolve, reject) => {
      // Create secure temp file for query
      const tempFile = path.join(
        require('os').tmpdir(),
        `soql_${crypto.randomUUID()}.txt`
      );

      // Write query to temp file
      fs.writeFile(tempFile, prepared.query, 'utf8')
        .then(() => {
          // Build command arguments safely
          const args = [
            'data',
            'query',
            '--file',
            tempFile,
            '--json'
          ];

          if (prepared.targetOrg) {
            args.push('--target-org', prepared.targetOrg);
          }

          if (prepared.needsToolingApi) {
            args.push('--use-tooling-api');
          }

          // Spawn process with timeout
          const child = spawn('sf', args, {
            timeout: this.config.maxExecutionTime,
            maxBuffer: 50 * 1024 * 1024 // 50MB
          });

          let stdout = '';
          let stderr = '';

          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          child.on('error', (error) => {
            fs.unlink(tempFile).catch(() => {}); // Clean up
            reject(new Error(`CLI execution failed: ${error.message}`));
          });

          child.on('close', async (code) => {
            // Clean up temp file
            await fs.unlink(tempFile).catch(() => {});

            if (code !== 0) {
              reject(new Error(`CLI exited with code ${code}: ${stderr}`));
              return;
            }

            try {
              const parsed = JSON.parse(stdout);

              if (parsed.status === 0 && parsed.result) {
                resolve(new QueryResult({
                  success: true,
                  data: parsed.result.records,
                  strategy: ExecutionStrategy.CLI,
                  dataSource: 'CLI_VERIFIED',
                  recordCount: parsed.result.totalSize,
                  metadata: {
                    done: parsed.result.done,
                    totalSize: parsed.result.totalSize
                  }
                }));
              } else {
                reject(new Error(parsed.message || 'Query failed'));
              }
            } catch (parseError) {
              reject(new Error(`Failed to parse CLI output: ${parseError.message}`));
            }
          });
        })
        .catch(reject);
    });
  }

  /**
   * Execute via REST API
   */
  async executeAPI(prepared, options) {
    // TODO: Implement REST API execution
    throw new Error('REST API execution not yet implemented');
  }

  /**
   * Layer 5: Validate result integrity
   */
  async validateResult(result) {
    if (!result.data) {
      return true; // No data to validate
    }

    // Check for fake data patterns
    const validation = this.detectFakeData(result.data);
    if (!validation.isReal) {
      result.warnings.push({
        type: 'DATA_INTEGRITY',
        message: validation.reason,
        details: validation.matches
      });

      // In strict mode, throw error
      if (this.config.strictDataValidation) {
        throw new Error(`Data integrity check failed: ${validation.reason}`);
      }
    }

    return true;
  }

  /**
   * Detect fake data patterns
   */
  detectFakeData(data) {
    const dataStr = JSON.stringify(data);

    // Check for sequential naming patterns
    const sequentialPatterns = [
      /Lead \d{2,}/g,
      /Account \d{2,}/g,
      /Opportunity \d{2,}/g,
      /Contact \d{2,}/g
    ];

    for (const pattern of sequentialPatterns) {
      const matches = dataStr.match(pattern);
      if (matches && matches.length > 3) {
        return {
          isReal: false,
          reason: 'Sequential naming pattern detected',
          matches: matches.slice(0, 5)
        };
      }
    }

    // Check for fake Salesforce IDs
    const fakeIdPattern = /00[QACL]0{14}/g;
    const fakeIds = dataStr.match(fakeIdPattern);
    if (fakeIds && fakeIds.length > 0) {
      return {
        isReal: false,
        reason: 'Fake Salesforce IDs detected',
        matches: fakeIds
      };
    }

    // Check for suspiciously round percentages
    const roundPercentages = dataStr.match(/\b(10|15|20|25|30|40|50|60|70|75|80|90|100)(\.0+)?\b/g);
    if (roundPercentages && roundPercentages.length > 5) {
      return {
        isReal: false,
        reason: 'Too many round numbers detected',
        matches: roundPercentages.slice(0, 5)
      };
    }

    return { isReal: true };
  }

  /**
   * Cache successful results
   */
  async cacheResult(query, result) {
    const cacheKey = this.getCacheKey(query);
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    // Limit cache size
    if (this.cache.size > 1000) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Generate cache key for query
   */
  getCacheKey(query, options = {}) {
    const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim();
    const context = options.targetOrg || 'default';
    return crypto.createHash('sha256')
      .update(`${context}:${normalized}`)
      .digest('hex');
  }

  /**
   * Fix common SOQL syntax issues
   */
  fixQuerySyntax(query) {
    let fixed = query;

    // Fix COUNT() spacing
    fixed = fixed.replace(/COUNT\s*\(\s*\)/gi, 'COUNT()');

    // Fix IS NOT NULL vs != null
    fixed = fixed.replace(/\s+IS\s+NOT\s+NULL/gi, ' != null');
    fixed = fixed.replace(/\s+IS\s+NULL/gi, ' = null');

    // Remove unnecessary quotes around field names
    fixed = fixed.replace(/'([A-Za-z_][A-Za-z0-9_]*__c)'/gi, '$1');

    // Fix escaped characters
    fixed = fixed.replace(/\\([!=<>])/g, '$1');

    return fixed;
  }

  /**
   * Apply field mappings for the target org
   */
  async applyFieldMappings(query, targetOrg) {
    const mappings = this.fieldMappings.get(targetOrg);
    if (!mappings) {
      return query;
    }

    let mapped = query;

    for (const [original, replacement] of mappings) {
      const pattern = new RegExp(`\\b${original}\\b`, 'gi');
      mapped = mapped.replace(pattern, replacement);
    }

    return mapped;
  }

  /**
   * Detect if query needs Tooling API
   */
  detectToolingApi(query) {
    const objects = this.extractObjects(query);
    return objects.some(obj => TOOLING_OBJECTS.includes(obj));
  }

  /**
   * Extract object names from query
   */
  extractObjects(query) {
    const objects = [];
    // Match object names after FROM, stopping at WHERE, ORDER BY, GROUP BY, LIMIT, or end
    const fromPattern = /\bFROM\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)(?:\s+WHERE|\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|\s*$)/gi;
    let match;

    while ((match = fromPattern.exec(query)) !== null) {
      // Split by comma if multiple objects
      const objectList = match[1].split(',').map(obj => obj.trim());
      objects.push(...objectList.filter(obj => obj && this.config.allowedObjectPattern.test(obj)));
    }

    return objects;
  }

  /**
   * Extract field names from query
   */
  extractFields(query) {
    const fields = [];

    // Remove subqueries for simplicity
    const simplified = query.replace(/\([^)]*\)/g, '');

    // Extract SELECT fields
    const selectMatch = simplified.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch) {
      const fieldList = selectMatch[1];
      const fieldParts = fieldList.split(',');

      for (const part of fieldParts) {
        // Extract field name (handle aliases)
        const fieldMatch = part.trim().match(/^([A-Za-z_][A-Za-z0-9_.]*)/);
        if (fieldMatch) {
          fields.push(fieldMatch[1]);
        }
      }
    }

    return fields;
  }

  /**
   * Determine execution strategies based on configuration
   */
  determineStrategies(options) {
    const strategies = [];

    // Check user preference
    if (options.strategy) {
      strategies.push(options.strategy);
    }

    // Default strategy order
    if (options.preferMCP !== false) {
      strategies.push(ExecutionStrategy.MCP);
    }

    strategies.push(ExecutionStrategy.CLI);

    if (options.enableAPI) {
      strategies.push(ExecutionStrategy.API);
    }

    return [...new Set(strategies)]; // Remove duplicates
  }

  /**
   * Check MCP availability
   */
  async checkMCPAvailability() {
    try {
      await fs.access(path.join(process.cwd(), '.mcp.json'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load field mappings from configuration
   */
  async loadFieldMappings() {
    try {
      const configPath = path.join(process.cwd(), '.soqlrc.json');
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);

      if (config.fieldMappings) {
        for (const [org, mappings] of Object.entries(config.fieldMappings)) {
          this.fieldMappings.set(org, new Map(Object.entries(mappings)));
        }
      }
    } catch (error) {
      // Config file doesn't exist or is invalid - use defaults
      this.loadDefaultMappings();
    }
  }

  /**
   * Load default field mappings
   */
  loadDefaultMappings() {
    // Default mappings for common field variations
    const defaults = {
      'hubspot_contact_id__c': 'Hubspot_ID__c',
      'hubspot_id__c': 'Hubspot_ID__c',
      'hs_object_id__c': 'Hubspot_ID__c',
      'hubspot_object_id__c': 'Hubspot_ID__c'
    };

    this.fieldMappings.set('default', new Map(Object.entries(defaults)));
  }

  /**
   * Precompile regex patterns for performance
   */
  precompilePatterns() {
    if (!this.config.precompileRegex) {
      return;
    }

    // Precompile common patterns
    this.compiledPatterns.set('selectFrom', /SELECT\s+(.+?)\s+FROM/i);
    this.compiledPatterns.set('fromObject', /\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)/gi);
    this.compiledPatterns.set('whereClause', /\bWHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|\s*$)/i);
    this.compiledPatterns.set('orderBy', /\bORDER\s+BY\s+(.+?)(?:\s+LIMIT|\s*$)/i);
    this.compiledPatterns.set('groupBy', /\bGROUP\s+BY\s+(.+?)(?:\s+HAVING|\s+ORDER\s+BY|\s+LIMIT|\s*$)/i);
  }

  /**
   * Update metrics after query execution
   */
  updateMetrics(result) {
    if (result.success) {
      this.metrics.successfulQueries++;
    } else {
      this.metrics.failedQueries++;
    }

    // Update average execution time
    const totalQueries = this.metrics.successfulQueries + this.metrics.failedQueries;
    this.metrics.averageExecutionTime =
      (this.metrics.averageExecutionTime * (totalQueries - 1) + result.metadata.executionTime) / totalQueries;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.totalQueries > 0
        ? (this.metrics.cacheHits / this.metrics.totalQueries * 100).toFixed(2) + '%'
        : '0%',
      successRate: this.metrics.totalQueries > 0
        ? (this.metrics.successfulQueries / this.metrics.totalQueries * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.emit('cache:cleared');
  }

  /**
   * Batch execute multiple queries
   */
  async executeBatch(queries, options = {}) {
    const results = [];
    const batchSize = options.batchSize || this.config.batchSize;

    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(query => this.execute(query, options))
      );
      results.push(...batchResults);
    }

    return results;
  }
}

// Export for use in other modules
module.exports = { SOQLQueryPipeline, QueryResult, ExecutionStrategy };

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: soql-query-pipeline.js <query> [--org <org-alias>] [--strategy <MCP|CLI|API>]');
    console.log('\nExamples:');
    console.log('  soql-query-pipeline.js "SELECT Id FROM Contact LIMIT 5"');
    console.log('  soql-query-pipeline.js "SELECT Id FROM Contact" --org my-org');
    console.log('  soql-query-pipeline.js "SELECT Id FROM Contact" --strategy CLI');
    process.exit(1);
  }

  // Parse arguments
  const query = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--org' && args[i + 1]) {
      options.targetOrg = args[i + 1];
      i++;
    } else if (args[i] === '--strategy' && args[i + 1]) {
      options.strategy = args[i + 1];
      i++;
    } else if (args[i] === '--strict') {
      options.strictMode = true;
    } else if (args[i] === '--no-cache') {
      options.skipCache = true;
    }
  }

  // Execute query
  const pipeline = new SOQLQueryPipeline();

  // Add event listeners for debugging
  pipeline.on('query:start', ({ queryId }) => {
    console.error(`[${queryId}] Starting query execution...`);
  });

  pipeline.on('strategy:attempt', ({ strategy }) => {
    console.error(`Attempting execution via ${strategy}...`);
  });

  pipeline.on('query:complete', ({ queryId, result }) => {
    console.error(`[${queryId}] Query completed in ${result.metadata.executionTime}ms`);
  });

  pipeline.on('query:error', ({ queryId, error }) => {
    console.error(`[${queryId}] Query failed: ${error.message}`);
  });

  // Run query
  pipeline.execute(query, options)
    .then(result => {
      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2));
        console.error(`\nSource: ${result.getDataSourceLabel()}`);
        console.error(`Records: ${result.metadata.recordCount}`);
        console.error(`Execution time: ${result.metadata.executionTime}ms`);
      } else {
        console.error(`Query failed: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error(`Fatal error: ${error.message}`);
      process.exit(1);
    });
}