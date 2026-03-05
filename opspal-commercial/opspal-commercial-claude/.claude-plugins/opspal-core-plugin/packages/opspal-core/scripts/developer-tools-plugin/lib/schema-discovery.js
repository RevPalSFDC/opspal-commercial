/**
 * schema-discovery.js
 *
 * Discovers and caches database schemas from Supabase to prevent runtime errors
 * caused by schema assumptions (e.g., assuming columns exist that don't)
 *
 * Addresses issues from PROCESSREFLECTIONS_SESSION_REFLECTION.md:
 * - "asana_project_url column doesn't exist" error
 * - Silent failures due to RLS policies
 * - Schema drift between documentation and implementation
 *
 * Usage:
 *   const { discoverSchema, validateColumn } = require('./schema-discovery');
 *
 *   // Discover table schema
 *   const schema = await discoverSchema('reflections');
 *   console.log(schema.columns); // { id: 'uuid', status: 'text', ... }
 *
 *   // Validate before operation
 *   await validateColumn('reflections', 'asana_project_url'); // Throws if missing
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs/promises');
const path = require('path');
const { createLogger } = require('./structured-logger');

const logger = createLogger('schema-discovery', {
  level: process.env.SCHEMA_DISCOVERY_LOG_LEVEL || 'INFO'
});

// Schema cache (in-memory + file-based)
const schemaCache = new Map();
const CACHE_DIR = '.claude/cache';
const CACHE_FILE = 'schema-cache.json';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class SchemaDiscoveryError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SchemaDiscoveryError';
    this.details = details;
  }
}

/**
 * Get Supabase client with appropriate credentials
 * @param {string} operation - Operation type (read, write, admin)
 * @returns {object} Supabase client
 */
function getSupabaseClient(operation = 'read') {
  const url = process.env.SUPABASE_URL;
  const key = operation === 'admin'
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new SchemaDiscoveryError('Missing Supabase credentials', {
      url: !!url,
      key: !!key,
      operation
    });
  }

  return createClient(url, key);
}

/**
 * Load schema cache from disk
 * @returns {Promise<Map>}
 */
async function loadCacheFromDisk() {
  try {
    const cachePath = path.join(CACHE_DIR, CACHE_FILE);
    const content = await fs.readFile(cachePath, 'utf-8');
    const cacheData = JSON.parse(content);

    // Rebuild Map from JSON
    const cache = new Map();
    for (const [key, value] of Object.entries(cacheData)) {
      const timestamp = new Date(value.timestamp);
      const age = Date.now() - timestamp.getTime();

      if (age < CACHE_TTL_MS) {
        cache.set(key, value);
      }
    }

    logger.debug('Loaded schema cache from disk', {
      entriesLoaded: cache.size,
      cacheFile: cachePath
    });

    return cache;
  } catch (error) {
    // Cache doesn't exist or is invalid, that's okay
    logger.debug('Schema cache not found or invalid', {
      error: error.message
    });
    return new Map();
  }
}

/**
 * Save schema cache to disk
 */
async function saveCacheToDisk() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cachePath = path.join(CACHE_DIR, CACHE_FILE);

    // Convert Map to JSON-serializable object
    const cacheData = {};
    for (const [key, value] of schemaCache.entries()) {
      cacheData[key] = value;
    }

    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');

    logger.debug('Saved schema cache to disk', {
      entriesStored: Object.keys(cacheData).length,
      cacheFile: cachePath
    });
  } catch (error) {
    logger.warn('Failed to save schema cache', {
      error: error.message
    });
  }
}

/**
 * Discover table schema from Supabase
 * @param {string} tableName - Table name to discover
 * @param {object} options - Options
 * @param {boolean} options.useCache - Use cached schema if available
 * @param {boolean} options.includeIndexes - Include index information
 * @param {boolean} options.includeConstraints - Include constraint information
 * @returns {Promise<object>} Schema information
 */
async function discoverSchema(tableName, options = {}) {
  const {
    useCache = true,
    includeIndexes = false,
    includeConstraints = false
  } = options;

  const cacheKey = `${tableName}:${includeIndexes}:${includeConstraints}`;

  // Check cache first
  if (useCache) {
    const cached = schemaCache.get(cacheKey);
    if (cached) {
      const age = Date.now() - new Date(cached.timestamp).getTime();
      if (age < CACHE_TTL_MS) {
        logger.debug('Using cached schema', {
          tableName,
          cacheAge_ms: age
        });
        return cached.schema;
      }
    }
  }

  const timer = logger.timer(`schema discovery: ${tableName}`);

  try {
    const supabase = getSupabaseClient('admin');

    // Query information_schema for column information
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_table_schema', { table_name: tableName });

    if (columnsError) {
      // Fallback: Try direct query to information_schema
      logger.warn('get_table_schema RPC failed, using fallback', {
        error: columnsError.message
      });

      const schema = await discoverSchemaFallback(tableName);
      return schema;
    }

    const schema = {
      tableName,
      columns: {},
      primaryKey: null,
      indexes: includeIndexes ? [] : undefined,
      constraints: includeConstraints ? [] : undefined,
      discovered_at: new Date().toISOString()
    };

    // Process columns
    for (const col of columns || []) {
      schema.columns[col.column_name] = {
        dataType: col.data_type,
        isNullable: col.is_nullable === 'YES',
        defaultValue: col.column_default,
        maxLength: col.character_maximum_length
      };

      if (col.column_name === 'id' || col.is_identity === 'YES') {
        schema.primaryKey = col.column_name;
      }
    }

    // Cache the schema
    schemaCache.set(cacheKey, {
      schema,
      timestamp: new Date().toISOString()
    });

    await saveCacheToDisk();

    timer.end({
      tableName,
      columnCount: Object.keys(schema.columns).length
    });

    return schema;
  } catch (error) {
    timer.fail(error, { tableName });
    throw new SchemaDiscoveryError(`Failed to discover schema for ${tableName}`, {
      tableName,
      error: error.message
    });
  }
}

/**
 * Fallback schema discovery using REST API
 * @param {string} tableName
 * @returns {Promise<object>}
 */
async function discoverSchemaFallback(tableName) {
  logger.info('Using fallback schema discovery', { tableName });

  const supabase = getSupabaseClient('admin');

  // Fetch a single row to infer schema
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
    throw error;
  }

  const schema = {
    tableName,
    columns: {},
    primaryKey: 'id', // Assumption
    discovered_at: new Date().toISOString(),
    fallback: true
  };

  // Infer schema from data
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      schema.columns[key] = {
        dataType: typeof value,
        isNullable: value === null,
        inferred: true
      };
    }
  }

  return schema;
}

/**
 * Validate that a column exists in a table
 * @param {string} tableName - Table name
 * @param {string} columnName - Column name to validate
 * @param {object} options - Options
 * @param {boolean} options.throwOnMissing - Throw error if column missing (default: true)
 * @returns {Promise<boolean>} True if column exists
 * @throws {SchemaDiscoveryError} If column doesn't exist and throwOnMissing=true
 */
async function validateColumn(tableName, columnName, options = {}) {
  const { throwOnMissing = true } = options;

  const schema = await discoverSchema(tableName);

  const exists = columnName in schema.columns;

  if (!exists) {
    logger.warn('Column not found in schema', {
      tableName,
      columnName,
      availableColumns: Object.keys(schema.columns)
    });

    if (throwOnMissing) {
      throw new SchemaDiscoveryError(`Column '${columnName}' does not exist in table '${tableName}'`, {
        tableName,
        columnName,
        availableColumns: Object.keys(schema.columns),
        suggestion: `Use one of: ${Object.keys(schema.columns).join(', ')}`
      });
    }
  }

  return exists;
}

/**
 * Validate multiple columns exist
 * @param {string} tableName - Table name
 * @param {string[]} columnNames - Column names to validate
 * @param {object} options - Options
 * @param {boolean} options.throwOnMissing - Throw error if any column missing
 * @returns {Promise<object>} Validation results
 */
async function validateColumns(tableName, columnNames, options = {}) {
  const { throwOnMissing = true } = options;

  const schema = await discoverSchema(tableName);
  const results = {
    valid: [],
    invalid: [],
    tableName
  };

  for (const columnName of columnNames) {
    if (columnName in schema.columns) {
      results.valid.push(columnName);
    } else {
      results.invalid.push(columnName);
    }
  }

  if (results.invalid.length > 0) {
    logger.warn('Some columns not found in schema', {
      tableName,
      invalidColumns: results.invalid,
      availableColumns: Object.keys(schema.columns)
    });

    if (throwOnMissing) {
      throw new SchemaDiscoveryError(`Columns missing in table '${tableName}': ${results.invalid.join(', ')}`, {
        tableName,
        invalidColumns: results.invalid,
        availableColumns: Object.keys(schema.columns)
      });
    }
  }

  return results;
}

/**
 * Get safe update object with only existing columns
 * @param {string} tableName - Table name
 * @param {object} updateData - Proposed update data
 * @returns {Promise<object>} Update object with only existing columns
 */
async function getSafeUpdateData(tableName, updateData) {
  const schema = await discoverSchema(tableName);
  const safeData = {};
  const skipped = [];

  for (const [key, value] of Object.entries(updateData)) {
    if (key in schema.columns) {
      safeData[key] = value;
    } else {
      skipped.push(key);
    }
  }

  if (skipped.length > 0) {
    logger.warn('Skipping columns that do not exist in schema', {
      tableName,
      skippedColumns: skipped,
      suggestion: 'Consider storing in JSONB column or adding column to schema'
    });
  }

  return { safeData, skipped };
}

/**
 * Clear schema cache
 * @param {string} tableName - Optional table name to clear specific cache
 */
async function clearCache(tableName = null) {
  if (tableName) {
    // Clear specific table from cache
    for (const key of schemaCache.keys()) {
      if (key.startsWith(`${tableName}:`)) {
        schemaCache.delete(key);
      }
    }
    logger.info('Cleared schema cache for table', { tableName });
  } else {
    // Clear entire cache
    schemaCache.clear();
    logger.info('Cleared entire schema cache');
  }

  await saveCacheToDisk();
}

/**
 * Generate schema documentation in markdown
 * @param {string} tableName - Table name
 * @returns {Promise<string>} Markdown documentation
 */
async function generateSchemaDoc(tableName) {
  const schema = await discoverSchema(tableName, {
    includeIndexes: true,
    includeConstraints: true
  });

  let doc = `# ${tableName} Table Schema\n\n`;
  doc += `**Discovered**: ${schema.discovered_at}\n\n`;
  doc += `## Columns\n\n`;
  doc += `| Column | Type | Nullable | Default |\n`;
  doc += `|--------|------|----------|----------|\n`;

  for (const [name, col] of Object.entries(schema.columns)) {
    const nullable = col.isNullable ? '✅' : '❌';
    const defaultVal = col.defaultValue || '-';
    doc += `| ${name} | ${col.dataType} | ${nullable} | ${defaultVal} |\n`;
  }

  doc += `\n**Primary Key**: ${schema.primaryKey || 'Unknown'}\n`;
  doc += `\n**Total Columns**: ${Object.keys(schema.columns).length}\n`;

  return doc;
}

// Initialize cache on module load
(async () => {
  const diskCache = await loadCacheFromDisk();
  for (const [key, value] of diskCache.entries()) {
    schemaCache.set(key, value);
  }
})();

module.exports = {
  discoverSchema,
  validateColumn,
  validateColumns,
  getSafeUpdateData,
  clearCache,
  generateSchemaDoc,
  SchemaDiscoveryError
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: node schema-discovery.js <table-name> [options]

Options:
  --clear-cache    Clear cached schema before discovery
  --generate-doc   Generate markdown documentation
  --validate <col> Validate specific column exists

Examples:
  node schema-discovery.js reflections
  node schema-discovery.js reflections --generate-doc
  node schema-discovery.js reflections --validate asana_project_url
  node schema-discovery.js reflections --clear-cache
    `);
    process.exit(0);
  }

  (async () => {
    const tableName = args[0];

    if (args.includes('--clear-cache')) {
      await clearCache(tableName);
      console.log(`✅ Cache cleared for ${tableName}`);
    }

    if (args.includes('--generate-doc')) {
      const doc = await generateSchemaDoc(tableName);
      console.log(doc);
    } else if (args.includes('--validate')) {
      const colIndex = args.indexOf('--validate');
      const columnName = args[colIndex + 1];

      try {
        await validateColumn(tableName, columnName);
        console.log(`✅ Column '${columnName}' exists in table '${tableName}'`);
      } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
      }
    } else {
      const schema = await discoverSchema(tableName);
      console.log(JSON.stringify(schema, null, 2));
    }
  })().catch(error => {
    console.error('Error:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
    process.exit(1);
  });
}
