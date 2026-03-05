#!/usr/bin/env node

/**
 * Supabase Directory Manager
 *
 * Manages customer project directory and access log in Supabase.
 * Uses Supabase MCP server for all database operations.
 *
 * Features:
 * - Query customer directory by name/aliases
 * - Upsert customer directory entries
 * - Log access operations across all systems
 * - Generate customer IDs
 * - Idempotent operations (safe to retry)
 */

const { execSync } = require('child_process');
const path = require('path');

class SupabaseDirectoryManager {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;

    // Supabase connection details from environment
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables required');
    }

    this.log('SupabaseDirectoryManager initialized', {
      url: this.supabaseUrl,
      dryRun: this.dryRun
    });
  }

  /**
   * Query customer by name or aliases
   *
   * @param {Object} options
   * @param {string} [options.customer] - Customer name
   * @param {string[]} [options.aliases] - Customer aliases
   * @returns {Promise<{match: boolean, customerId?: string, record?: Object}>}
   */
  async queryCustomer({ customer, aliases = [] }) {
    this.log('Querying customer', { customer, aliases });

    try {
      // Build query conditions
      const conditions = [];

      if (customer) {
        conditions.push(`customer.ilike.%${customer}%`);
      }

      if (aliases && aliases.length > 0) {
        // Check if any alias is in the aliases array
        aliases.forEach(alias => {
          conditions.push(`aliases.cs.{${alias}}`);
        });
      }

      // If no conditions, cannot search
      if (conditions.length === 0) {
        return { match: false };
      }

      // Execute query via Supabase REST API
      const query = conditions.join(',');
      const url = `${this.supabaseUrl}/rest/v1/customer_project_directory?or=(${query})&select=*`;

      const response = await this._executeQuery(url, 'GET');
      const results = JSON.parse(response);

      if (results && results.length > 0) {
        // Return first match
        const record = results[0];

        this.log('Customer found', record);

        return {
          match: true,
          customerId: record.customer_id,
          record
        };
      }

      this.log('No customer found');
      return { match: false };

    } catch (error) {
      throw new Error(`Failed to query customer: ${error.message}`);
    }
  }

  /**
   * Upsert customer directory entry
   *
   * @param {Object} data
   * @param {string} data.customerId - Customer ID (generated if not provided)
   * @param {string} data.customer - Customer name
   * @param {string[]} [data.aliases] - Customer aliases
   * @param {string} [data.githubRepo] - GitHub repository name
   * @param {string} [data.githubRepoUrl] - GitHub repository URL
   * @param {string} [data.driveFolderId] - Google Drive folder ID
   * @param {string} [data.driveFolderUrl] - Google Drive folder URL
   * @param {string[]} [data.asanaProjectIds] - Asana project IDs
   * @param {string[]} [data.asanaProjectUrls] - Asana project URLs
   * @param {string} data.createdBy - User email who created
   * @param {string} [data.createdDate] - Creation timestamp (auto-set if not provided)
   * @param {string} [data.lastAccessedBy] - User email who last accessed
   * @param {string} [data.lastAccessedDate] - Last access timestamp (auto-set if not provided)
   * @param {Object} [data.metadata] - Additional metadata
   * @returns {Promise<{customerId: string, record: Object}>}
   */
  async upsertCustomerDirectory(data) {
    this.log('Upserting customer directory', data);

    // Validate required fields
    if (!data.customer) {
      throw new Error('Customer name is required');
    }

    if (!data.createdBy) {
      throw new Error('createdBy (user email) is required');
    }

    // Generate customer ID if not provided
    if (!data.customerId) {
      data.customerId = this.generateCustomerId(data.customer);
    }

    if (this.dryRun) {
      this.log('[DRY RUN] Would upsert customer directory', data);
      return {
        customerId: data.customerId,
        record: data,
        dryRun: true
      };
    }

    try {
      // Build record
      const record = {
        customer_id: data.customerId,
        customer: data.customer,
        aliases: data.aliases || [],
        github_repo: data.githubRepo || null,
        github_repo_url: data.githubRepoUrl || null,
        drive_folder_id: data.driveFolderId || null,
        drive_folder_url: data.driveFolderUrl || null,
        asana_project_ids: data.asanaProjectIds || [],
        asana_project_urls: data.asanaProjectUrls || [],
        created_by: data.createdBy,
        created_date: data.createdDate || new Date().toISOString(),
        last_accessed_by: data.lastAccessedBy || data.createdBy,
        last_accessed_date: data.lastAccessedDate || new Date().toISOString(),
        metadata: data.metadata || {},
        schema_version: '1.0.0'
      };

      // Upsert via Supabase REST API
      const url = `${this.supabaseUrl}/rest/v1/customer_project_directory`;

      const response = await this._executeQuery(url, 'POST', record, {
        'Prefer': 'resolution=merge-duplicates,return=representation'
      });

      const result = JSON.parse(response);

      this.log('Customer directory upserted', result);

      return {
        customerId: data.customerId,
        record: result[0] || record
      };

    } catch (error) {
      throw new Error(`Failed to upsert customer directory: ${error.message}`);
    }
  }

  /**
   * Log access operation
   *
   * @param {Object} entry
   * @param {string} [entry.customerId] - Customer ID
   * @param {string} entry.system - System name ('github', 'drive', 'asana', 'supabase')
   * @param {string} [entry.systemId] - System-specific ID (repo name, folder id, project id)
   * @param {string} [entry.object] - Object type ('repo', 'folder', 'project', 'task', 'table')
   * @param {string} entry.action - Action performed ('read', 'create', 'connect', 'update', 'delete', 'confirm')
   * @param {Object} [entry.headers] - Request headers (keys only, no values)
   * @param {number} [entry.datasetSize] - Number of records read/written
   * @param {number} [entry.durationMs] - Operation duration in milliseconds
   * @param {string} [entry.runningScript] - Name of script performing operation
   * @param {string} entry.userEmail - User email performing operation
   * @param {Object} [entry.metadata] - Additional metadata
   * @param {boolean} [entry.success] - Whether operation succeeded (default: true)
   * @param {string} [entry.errorMessage] - Error message if failed
   * @returns {Promise<{logId: string}>}
   */
  async logAccess(entry) {
    this.log('Logging access', entry);

    // Validate required fields
    if (!entry.system || !['github', 'drive', 'asana', 'supabase'].includes(entry.system)) {
      throw new Error('system must be one of: github, drive, asana, supabase');
    }

    if (!entry.action || !['read', 'create', 'connect', 'update', 'delete', 'confirm'].includes(entry.action)) {
      throw new Error('action must be one of: read, create, connect, update, delete, confirm');
    }

    if (!entry.userEmail) {
      throw new Error('userEmail is required');
    }

    if (this.dryRun) {
      this.log('[DRY RUN] Would log access', entry);
      return {
        logId: `DRYRUN_${Date.now()}`,
        dryRun: true
      };
    }

    try {
      // Build log record
      const record = {
        customer_id: entry.customerId || null,
        system: entry.system,
        system_id: entry.systemId || null,
        object: entry.object || null,
        action: entry.action,
        headers: entry.headers || {},
        dataset_size: entry.datasetSize || null,
        duration_ms: entry.durationMs || null,
        running_script: entry.runningScript || 'project-connect',
        date: new Date().toISOString(),
        user_email: entry.userEmail,
        metadata: entry.metadata || {},
        success: entry.success !== undefined ? entry.success : true,
        error_message: entry.errorMessage || null
      };

      // Insert via Supabase REST API
      const url = `${this.supabaseUrl}/rest/v1/revpal_access_log`;

      const response = await this._executeQuery(url, 'POST', record, {
        'Prefer': 'return=representation'
      });

      const result = JSON.parse(response);

      this.log('Access logged', result);

      return {
        logId: result[0]?.log_id || 'unknown'
      };

    } catch (error) {
      throw new Error(`Failed to log access: ${error.message}`);
    }
  }

  /**
   * Generate customer ID
   *
   * Format: RP-{FIRST_3_LETTERS}{RANDOM_6_DIGITS}
   * Example: "Acme Robotics" → "RP-ACM123456"
   *
   * @param {string} customer - Customer name
   * @returns {string} - Generated customer ID
   */
  generateCustomerId(customer) {
    // Extract first 3 letters (alphanumeric only)
    const prefix = customer
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 3)
      .toUpperCase()
      .padEnd(3, 'X'); // Pad with X if less than 3 chars

    // Generate random 6-digit number
    const random = Math.floor(100000 + Math.random() * 900000);

    return `RP-${prefix}${random}`;
  }

  /**
   * Execute Supabase query via REST API
   *
   * @private
   * @param {string} url - API endpoint URL
   * @param {string} method - HTTP method
   * @param {Object} [body] - Request body
   * @param {Object} [extraHeaders] - Additional headers
   * @returns {Promise<string>} - Response body
   */
  async _executeQuery(url, method, body = null, extraHeaders = {}) {
    const headers = {
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    };

    const curlCmd = [
      'curl',
      '-X', method,
      ...Object.entries(headers).flatMap(([key, value]) => ['-H', `"${key}: ${value}"`]),
      body ? `-d '${JSON.stringify(body)}'` : '',
      `"${url}"`
    ].filter(Boolean).join(' ');

    this.log('Executing query', { method, url });

    try {
      const response = execSync(curlCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      return response;
    } catch (error) {
      throw new Error(`Supabase query failed: ${error.message}`);
    }
  }

  /**
   * Log message if verbose mode enabled
   *
   * @private
   * @param {string} message - Log message
   * @param {*} [data] - Optional data to log
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[SupabaseDirectoryManager] ${message}`, data !== null ? data : '');
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Usage: node supabase-directory-manager.js <command> [options]

Commands:
  query          Query customer by name or aliases
  upsert         Upsert customer directory entry
  log            Log access operation
  generate-id    Generate customer ID from name

Examples:
  # Query customer
  node supabase-directory-manager.js query --customer "Acme Robotics"

  # Upsert customer
  node supabase-directory-manager.js upsert --customer "Acme Robotics" --created-by "user@example.com"

  # Log access
  node supabase-directory-manager.js log --system github --action create --user-email "user@example.com"

  # Generate ID
  node supabase-directory-manager.js generate-id "Acme Robotics"
    `);
    process.exit(0);
  }

  const parseArgs = (args) => {
    const parsed = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].substring(2);
        const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
        parsed[key] = value;
        if (value !== true) i++;
      }
    }
    return parsed;
  };

  const options = parseArgs(args);
  const manager = new SupabaseDirectoryManager({
    verbose: true,
    dryRun: options['dry-run'] || false
  });

  (async () => {
    try {
      switch (command) {
        case 'query':
          const queryResult = await manager.queryCustomer({
            customer: options.customer,
            aliases: options.aliases ? options.aliases.split(',') : []
          });
          console.log(JSON.stringify(queryResult, null, 2));
          break;

        case 'upsert':
          const upsertResult = await manager.upsertCustomerDirectory({
            customer: options.customer,
            customerId: options.customerId,
            aliases: options.aliases ? options.aliases.split(',') : [],
            githubRepo: options.githubRepo,
            githubRepoUrl: options.githubRepoUrl,
            driveFolderId: options.driveFolderId,
            driveFolderUrl: options.driveFolderUrl,
            asanaProjectIds: options.asanaProjectIds ? options.asanaProjectIds.split(',') : [],
            asanaProjectUrls: options.asanaProjectUrls ? options.asanaProjectUrls.split(',') : [],
            createdBy: options.createdBy || options['created-by']
          });
          console.log(JSON.stringify(upsertResult, null, 2));
          break;

        case 'log':
          const logResult = await manager.logAccess({
            customerId: options.customerId,
            system: options.system,
            systemId: options.systemId,
            object: options.object,
            action: options.action,
            userEmail: options.userEmail || options['user-email']
          });
          console.log(JSON.stringify(logResult, null, 2));
          break;

        case 'generate-id':
          const customerId = manager.generateCustomerId(args[1]);
          console.log(customerId);
          break;

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = SupabaseDirectoryManager;
