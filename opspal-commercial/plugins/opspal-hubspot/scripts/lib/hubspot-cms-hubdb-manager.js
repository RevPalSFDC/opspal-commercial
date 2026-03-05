/**
 * HubSpot CMS HubDB Manager
 *
 * Script library for HubSpot HubDB API (v3) operations.
 * Provides table management, row CRUD, batch operations, and draft/publish workflows.
 *
 * @requires HUBSPOT_ACCESS_TOKEN - HubSpot API access token
 * @requires HUBSPOT_PORTAL_ID - HubSpot portal ID
 */

const https = require('https');

class HubSpotCMSHubDBManager {
  /**
   * Initialize the HubDB Manager
   * @param {Object} config - Configuration object
   * @param {string} config.accessToken - HubSpot access token
   * @param {string} config.portalId - HubSpot portal ID
   */
  constructor(config) {
    if (!config.accessToken) {
      throw new Error('HUBSPOT_ACCESS_TOKEN is required');
    }
    this.accessToken = config.accessToken;
    this.portalId = config.portalId;
    this.baseUrl = 'api.hubapi.com';
    this.basePath = '/cms/v3/hubdb';
  }

  /**
   * Make an API request to HubSpot
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} data - Request body (for POST/PUT/PATCH)
   * @returns {Promise<Object>} API response
   */
  async request(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        port: 443,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = body ? JSON.parse(body) : {};
            if (res.statusCode >= 400) {
              const error = new Error(response.message || `HTTP ${res.statusCode}`);
              error.status = res.statusCode;
              error.response = response;
              reject(error);
            } else {
              resolve(response);
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${body}`));
          }
        });
      });

      req.on('error', reject);

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // ==========================================
  // TABLE OPERATIONS
  // ==========================================

  /**
   * List all HubDB tables
   * @param {Object} options - Query options
   * @param {boolean} options.archived - Include archived tables
   * @returns {Promise<Object>} Tables response
   */
  async listTables(options = {}) {
    const params = new URLSearchParams();
    if (options.archived !== undefined) params.append('archived', options.archived);

    const queryString = params.toString();
    const path = queryString
      ? `${this.basePath}/tables?${queryString}`
      : `${this.basePath}/tables`;

    return await this.request('GET', path);
  }

  /**
   * Get a table by ID or name
   * @param {string} tableIdOrName - Table ID or name
   * @param {boolean} draft - Get draft version
   * @returns {Promise<Object>} Table details
   */
  async getTable(tableIdOrName, draft = false) {
    const path = draft
      ? `${this.basePath}/tables/${tableIdOrName}/draft`
      : `${this.basePath}/tables/${tableIdOrName}`;

    return await this.request('GET', path);
  }

  /**
   * Get table by name
   * @param {string} name - Table name
   * @returns {Promise<Object|null>} Table or null if not found
   */
  async getTableByName(name) {
    try {
      return await this.getTable(name);
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new HubDB table
   * @param {Object} tableConfig - Table configuration
   * @param {string} tableConfig.name - Table name (snake_case)
   * @param {string} tableConfig.label - Display label
   * @param {Array} tableConfig.columns - Column definitions
   * @param {boolean} tableConfig.useForPages - Enable for dynamic pages
   * @param {boolean} tableConfig.allowPublicApiAccess - Allow public API access
   * @returns {Promise<Object>} Created table
   */
  async createTable(tableConfig) {
    const payload = {
      name: tableConfig.name,
      label: tableConfig.label || tableConfig.name,
      columns: tableConfig.columns || [],
      useForPages: tableConfig.useForPages || false,
      allowPublicApiAccess: tableConfig.allowPublicApiAccess || false
    };

    // Add optional settings
    if (tableConfig.enableChildTablePages !== undefined) {
      payload.enableChildTablePages = tableConfig.enableChildTablePages;
    }
    if (tableConfig.dynamicMetaTags) {
      payload.dynamicMetaTags = tableConfig.dynamicMetaTags;
    }

    return await this.request('POST', `${this.basePath}/tables`, payload);
  }

  /**
   * Update a table
   * @param {string} tableIdOrName - Table ID or name
   * @param {Object} updates - Table updates
   * @returns {Promise<Object>} Updated table
   */
  async updateTable(tableIdOrName, updates) {
    return await this.request('PUT', `${this.basePath}/tables/${tableIdOrName}`, updates);
  }

  /**
   * Delete a table
   * @param {string} tableIdOrName - Table ID or name
   * @returns {Promise<void>}
   */
  async deleteTable(tableIdOrName) {
    return await this.request('DELETE', `${this.basePath}/tables/${tableIdOrName}`);
  }

  /**
   * Clone a table
   * @param {string} tableIdOrName - Source table ID or name
   * @param {string} newName - New table name
   * @param {boolean} copyRows - Copy rows to new table
   * @returns {Promise<Object>} Cloned table
   */
  async cloneTable(tableIdOrName, newName, copyRows = true) {
    return await this.request('POST', `${this.basePath}/tables/${tableIdOrName}/clone`, {
      newName,
      copyRows
    });
  }

  // ==========================================
  // COLUMN OPERATIONS
  // ==========================================

  /**
   * Add a column to a table (draft)
   * @param {string} tableIdOrName - Table ID or name
   * @param {Object} column - Column definition
   * @returns {Promise<Object>} Updated table
   */
  async addColumn(tableIdOrName, column) {
    // Get current draft table
    const table = await this.getTable(tableIdOrName, true);

    // Add new column
    const columns = [...(table.columns || []), column];

    // Update draft
    return await this.updateDraftTable(tableIdOrName, { columns });
  }

  /**
   * Remove a column from a table (draft)
   * @param {string} tableIdOrName - Table ID or name
   * @param {string} columnName - Column name to remove
   * @returns {Promise<Object>} Updated table
   */
  async removeColumn(tableIdOrName, columnName) {
    const table = await this.getTable(tableIdOrName, true);
    const columns = (table.columns || []).filter(c => c.name !== columnName);

    return await this.updateDraftTable(tableIdOrName, { columns });
  }

  // ==========================================
  // DRAFT/PUBLISH OPERATIONS
  // ==========================================

  /**
   * Get draft table
   * @param {string} tableIdOrName - Table ID or name
   * @returns {Promise<Object>} Draft table
   */
  async getDraftTable(tableIdOrName) {
    return await this.request('GET', `${this.basePath}/tables/${tableIdOrName}/draft`);
  }

  /**
   * Update draft table
   * @param {string} tableIdOrName - Table ID or name
   * @param {Object} updates - Draft updates
   * @returns {Promise<Object>} Updated draft
   */
  async updateDraftTable(tableIdOrName, updates) {
    return await this.request('PUT', `${this.basePath}/tables/${tableIdOrName}/draft`, updates);
  }

  /**
   * Publish draft table to live
   * @param {string} tableIdOrName - Table ID or name
   * @returns {Promise<Object>} Published table
   */
  async publishTable(tableIdOrName) {
    return await this.request('POST', `${this.basePath}/tables/${tableIdOrName}/draft/publish`);
  }

  /**
   * Reset draft to published state
   * @param {string} tableIdOrName - Table ID or name
   * @returns {Promise<Object>} Reset table
   */
  async resetDraft(tableIdOrName) {
    return await this.request('POST', `${this.basePath}/tables/${tableIdOrName}/draft/reset`);
  }

  // ==========================================
  // ROW OPERATIONS
  // ==========================================

  /**
   * List rows in a table
   * @param {string} tableIdOrName - Table ID or name
   * @param {Object} options - Query options
   * @param {boolean} options.draft - Query draft rows
   * @param {number} options.limit - Results per page (max 1000)
   * @param {string} options.after - Pagination cursor
   * @param {string} options.sort - Sort column
   * @param {string} options.sortOrder - ASC or DESC
   * @param {Object} options.filters - Column filters
   * @returns {Promise<Object>} Rows response
   */
  async listRows(tableIdOrName, options = {}) {
    const params = new URLSearchParams();

    if (options.limit) params.append('limit', Math.min(options.limit, 1000));
    if (options.after) params.append('after', options.after);
    if (options.sort) params.append('sort', options.sort);

    // Add filters (e.g., column__eq=value)
    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        params.append(key, value);
      }
    }

    const queryString = params.toString();
    const basePath = options.draft
      ? `${this.basePath}/tables/${tableIdOrName}/rows/draft`
      : `${this.basePath}/tables/${tableIdOrName}/rows`;

    const path = queryString ? `${basePath}?${queryString}` : basePath;

    return await this.request('GET', path);
  }

  /**
   * Get all rows with automatic pagination
   * @param {string} tableIdOrName - Table ID or name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} All rows
   */
  async getAllRows(tableIdOrName, options = {}) {
    const allRows = [];
    let after = null;

    do {
      const response = await this.listRows(tableIdOrName, {
        ...options,
        limit: 1000,
        after
      });

      allRows.push(...(response.results || []));
      after = response.paging?.next?.after || null;

      // Rate limiting pause
      if (after) await this.sleep(100);
    } while (after);

    return allRows;
  }

  /**
   * Get a single row by ID
   * @param {string} tableIdOrName - Table ID or name
   * @param {string} rowId - Row ID
   * @param {boolean} draft - Get draft version
   * @returns {Promise<Object>} Row data
   */
  async getRow(tableIdOrName, rowId, draft = false) {
    const path = draft
      ? `${this.basePath}/tables/${tableIdOrName}/rows/draft/${rowId}`
      : `${this.basePath}/tables/${tableIdOrName}/rows/${rowId}`;

    return await this.request('GET', path);
  }

  /**
   * Create a row
   * @param {string} tableIdOrName - Table ID or name
   * @param {Object} rowData - Row data (column values)
   * @returns {Promise<Object>} Created row
   */
  async createRow(tableIdOrName, rowData) {
    return await this.request(
      'POST',
      `${this.basePath}/tables/${tableIdOrName}/rows`,
      { values: rowData }
    );
  }

  /**
   * Create a draft row
   * @param {string} tableIdOrName - Table ID or name
   * @param {Object} rowData - Row data
   * @returns {Promise<Object>} Created draft row
   */
  async createDraftRow(tableIdOrName, rowData) {
    return await this.request(
      'POST',
      `${this.basePath}/tables/${tableIdOrName}/rows/draft`,
      { values: rowData }
    );
  }

  /**
   * Update a row
   * @param {string} tableIdOrName - Table ID or name
   * @param {string} rowId - Row ID
   * @param {Object} updates - Column updates
   * @returns {Promise<Object>} Updated row
   */
  async updateRow(tableIdOrName, rowId, updates) {
    return await this.request(
      'PUT',
      `${this.basePath}/tables/${tableIdOrName}/rows/${rowId}`,
      { values: updates }
    );
  }

  /**
   * Delete a row
   * @param {string} tableIdOrName - Table ID or name
   * @param {string} rowId - Row ID
   * @returns {Promise<void>}
   */
  async deleteRow(tableIdOrName, rowId) {
    return await this.request(
      'DELETE',
      `${this.basePath}/tables/${tableIdOrName}/rows/${rowId}`
    );
  }

  // ==========================================
  // BATCH OPERATIONS
  // ==========================================

  /**
   * Batch create rows
   * @param {string} tableIdOrName - Table ID or name
   * @param {Array} rows - Array of row data objects
   * @returns {Promise<Object>} Batch result
   */
  async batchCreateRows(tableIdOrName, rows) {
    const inputs = rows.map(row => ({ values: row }));

    return await this.request(
      'POST',
      `${this.basePath}/tables/${tableIdOrName}/rows/batch/create`,
      { inputs }
    );
  }

  /**
   * Batch update rows
   * @param {string} tableIdOrName - Table ID or name
   * @param {Array} updates - Array of {id, values} objects
   * @returns {Promise<Object>} Batch result
   */
  async batchUpdateRows(tableIdOrName, updates) {
    const inputs = updates.map(u => ({
      id: u.id,
      values: u.values
    }));

    return await this.request(
      'POST',
      `${this.basePath}/tables/${tableIdOrName}/rows/batch/update`,
      { inputs }
    );
  }

  /**
   * Batch delete rows
   * @param {string} tableIdOrName - Table ID or name
   * @param {Array} rowIds - Array of row IDs to delete
   * @returns {Promise<void>}
   */
  async batchDeleteRows(tableIdOrName, rowIds) {
    return await this.request(
      'POST',
      `${this.basePath}/tables/${tableIdOrName}/rows/batch/delete`,
      { inputs: rowIds.map(id => ({ id })) }
    );
  }

  /**
   * Batch import rows with rate limiting
   * @param {string} tableIdOrName - Table ID or name
   * @param {Array} rows - Rows to import
   * @param {number} batchSize - Rows per batch (max 100)
   * @returns {Promise<Object>} Import results
   */
  async batchImportRows(tableIdOrName, rows, batchSize = 100) {
    const results = {
      created: 0,
      failed: [],
      total: rows.length
    };

    const actualBatchSize = Math.min(batchSize, 100);

    for (let i = 0; i < rows.length; i += actualBatchSize) {
      const batch = rows.slice(i, i + actualBatchSize);

      try {
        const response = await this.batchCreateRows(tableIdOrName, batch);
        results.created += response.results?.length || batch.length;
      } catch (error) {
        results.failed.push({
          startIndex: i,
          endIndex: i + batch.length,
          error: error.message
        });
      }

      // Rate limiting
      if (i + actualBatchSize < rows.length) {
        await this.sleep(100);
      }
    }

    return results;
  }

  // ==========================================
  // DYNAMIC PAGE HELPERS
  // ==========================================

  /**
   * Generate HubL listing page template
   * @param {string} tableIdOrName - Table ID or name
   * @param {Object} options - Template options
   * @returns {Promise<string>} HubL template
   */
  async generateListingTemplate(tableIdOrName, options = {}) {
    const table = await this.getTable(tableIdOrName);
    const columns = table.columns || [];

    const sortColumn = options.sort || 'hs_created_at';
    const itemVar = options.itemVar || 'item';

    let template = `{# ${table.label} Listing Page #}\n`;
    template += `{% set items = hubdb_table_rows('${table.name}', '&orderBy=${sortColumn}') %}\n\n`;
    template += `<div class="${table.name}-list">\n`;
    template += `  {% for ${itemVar} in items %}\n`;
    template += `    <div class="${table.name}-item">\n`;

    // Add common columns
    for (const col of columns) {
      if (col.type === 'IMAGE') {
        template += `      {% if ${itemVar}.${col.name} %}\n`;
        template += `        <img src="{{ ${itemVar}.${col.name}.url }}" alt="{{ ${itemVar}.${col.name}.alt }}">\n`;
        template += `      {% endif %}\n`;
      } else if (col.type === 'RICHTEXT') {
        template += `      <div class="${col.name}">{{ ${itemVar}.${col.name} }}</div>\n`;
      } else if (col.type === 'URL') {
        template += `      {% if ${itemVar}.${col.name} %}\n`;
        template += `        <a href="{{ ${itemVar}.${col.name} }}">{{ ${itemVar}.${col.name} }}</a>\n`;
        template += `      {% endif %}\n`;
      } else if (col.type === 'CURRENCY') {
        template += `      <span class="${col.name}">{{ ${itemVar}.${col.name}|format_currency }}</span>\n`;
      } else {
        template += `      <span class="${col.name}">{{ ${itemVar}.${col.name} }}</span>\n`;
      }
    }

    template += `      <a href="/${table.name}/{{ ${itemVar}.hs_path }}">View Details</a>\n`;
    template += `    </div>\n`;
    template += `  {% endfor %}\n`;
    template += `</div>\n\n`;
    template += `{% if items|length == 0 %}\n`;
    template += `  <p>No ${table.label.toLowerCase()} found.</p>\n`;
    template += `{% endif %}\n`;

    return template;
  }

  /**
   * Generate HubL detail page template
   * @param {string} tableIdOrName - Table ID or name
   * @param {Object} options - Template options
   * @returns {Promise<string>} HubL template
   */
  async generateDetailTemplate(tableIdOrName, options = {}) {
    const table = await this.getTable(tableIdOrName);
    const columns = table.columns || [];
    const itemVar = options.itemVar || 'item';

    let template = `{# ${table.label} Detail Page #}\n`;
    template += `{% set ${itemVar} = dynamic_page_hubdb_row %}\n\n`;
    template += `<article class="${table.name}-detail">\n`;

    for (const col of columns) {
      if (col.type === 'IMAGE') {
        template += `  {% if ${itemVar}.${col.name} %}\n`;
        template += `    <img src="{{ ${itemVar}.${col.name}.url }}" alt="{{ ${itemVar}.${col.name}.alt }}" class="${col.name}">\n`;
        template += `  {% endif %}\n`;
      } else if (col.type === 'RICHTEXT') {
        template += `  <div class="${col.name}">{{ ${itemVar}.${col.name} }}</div>\n`;
      } else if (col.type === 'URL') {
        template += `  {% if ${itemVar}.${col.name} %}\n`;
        template += `    <a href="{{ ${itemVar}.${col.name} }}" class="${col.name}">{{ ${itemVar}.${col.name} }}</a>\n`;
        template += `  {% endif %}\n`;
      } else if (col.type === 'CURRENCY') {
        template += `  <div class="${col.name}">{{ ${itemVar}.${col.name}|format_currency }}</div>\n`;
      } else if (col.type === 'DATE' || col.type === 'DATETIME') {
        template += `  <div class="${col.name}">{{ ${itemVar}.${col.name}|datetimeformat('%B %d, %Y') }}</div>\n`;
      } else {
        template += `  <div class="${col.name}">{{ ${itemVar}.${col.name} }}</div>\n`;
      }
    }

    template += `</article>\n`;

    return template;
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Sleep helper for rate limiting
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate column type
   * @param {string} type - Column type to validate
   * @returns {boolean} True if valid
   */
  isValidColumnType(type) {
    const validTypes = [
      'TEXT', 'RICHTEXT', 'URL', 'IMAGE', 'SELECT', 'MULTISELECT',
      'DATE', 'DATETIME', 'NUMBER', 'CURRENCY', 'BOOLEAN',
      'LOCATION', 'FOREIGN_ID', 'VIDEO'
    ];
    return validTypes.includes(type);
  }

  /**
   * Get table statistics
   * @param {string} tableIdOrName - Table ID or name
   * @returns {Promise<Object>} Table statistics
   */
  async getTableStats(tableIdOrName) {
    const table = await this.getTable(tableIdOrName);
    const rows = await this.listRows(tableIdOrName, { limit: 1 });

    return {
      id: table.id,
      name: table.name,
      label: table.label,
      columnCount: table.columns?.length || 0,
      rowCount: rows.total || 0,
      useForPages: table.useForPages,
      allowPublicApiAccess: table.allowPublicApiAccess,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt
    };
  }
}

module.exports = HubSpotCMSHubDBManager;
