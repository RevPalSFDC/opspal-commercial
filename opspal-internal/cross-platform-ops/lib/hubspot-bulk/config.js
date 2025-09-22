/**
 * HubSpot Bulk Operations Configuration
 * Centralized tunables for all bulk operations
 */

module.exports = {
    // API Endpoints
    api: {
        baseUrl: process.env.HUBSPOT_API_URL || 'https://api.hubapi.com',
        version: 'v3'
    },

    // CRM Imports Configuration
    imports: {
        maxRowsPerFile: parseInt(process.env.HS_MAX_ROWS_PER_FILE) || 10000000, // 10M max
        maxFileSizeMB: parseInt(process.env.HS_MAX_FILE_SIZE_MB) || 512,       // 512MB max
        maxConcurrent: parseInt(process.env.HS_MAX_CONCURRENT_IMPORTS) || 5,
        pollIntervalMs: parseInt(process.env.HS_POLL_INTERVAL_MS) || 5000,     // 5 sec
        maxPollDurationMs: parseInt(process.env.HS_MAX_POLL_DURATION_MS) || 3600000, // 1 hour
        defaultDateFormat: process.env.HS_DATE_FORMAT || 'YYYY-MM-DD',
        defaultOperation: 'UPSERT', // CREATE, UPDATE, UPSERT
        duplicateHandling: 'UPDATE' // UPDATE, SKIP, FAIL
    },

    // CRM Exports Configuration
    exports: {
        defaultProperties: {
            contacts: ['email', 'firstname', 'lastname', 'createdate', 'lastmodifieddate'],
            companies: ['domain', 'name', 'createdate', 'lastmodifieddate']
        },
        maxPropertiesPerExport: 100,
        exportFormat: 'CSV', // CSV, XLSX
        includeAssociations: false,
        pollIntervalMs: parseInt(process.env.HS_EXPORT_POLL_INTERVAL_MS) || 10000, // 10 sec
        maxPollDurationMs: parseInt(process.env.HS_EXPORT_MAX_POLL_MS) || 7200000, // 2 hours
        downloadTimeoutMs: parseInt(process.env.HS_DOWNLOAD_TIMEOUT_MS) || 600000  // 10 min
    },

    // Rate Limiting
    rateLimit: {
        burst: {
            requestsPerSecond: parseInt(process.env.HS_BURST_RPS) || 10,
            requestsPer10Seconds: parseInt(process.env.HS_BURST_10S) || 100
        },
        daily: {
            requestsPerDay: parseInt(process.env.HS_DAILY_LIMIT) || 500000
        },
        retryAfterDefault: 10, // seconds
        backoff: {
            initialDelayMs: 1000,
            maxDelayMs: 60000,
            multiplier: 2,
            jitterFactor: 0.1 // 10% jitter
        }
    },

    // CSV Processing
    csv: {
        chunkSizeMB: parseInt(process.env.HS_CSV_CHUNK_MB) || 100,
        maxRowsPerChunk: parseInt(process.env.HS_CSV_CHUNK_ROWS) || 500000,
        encoding: 'utf-8',
        delimiter: ',',
        quote: '"',
        escape: '"',
        header: true,
        skipEmptyLines: true,
        trim: true
    },

    // File Paths
    paths: {
        tempDir: process.env.HS_TEMP_DIR || './tmp/hubspot-bulk',
        jobStateDir: process.env.HS_JOB_STATE_DIR || './.jobs/hubspot',
        outputDir: process.env.HS_OUTPUT_DIR || './out',
        logsDir: process.env.HS_LOGS_DIR || './logs/hubspot'
    },

    // Monitoring
    monitoring: {
        logLevel: process.env.HS_LOG_LEVEL || 'info',
        metricsEnabled: process.env.HS_METRICS_ENABLED !== 'false',
        dashboardEnabled: process.env.HS_DASHBOARD !== 'false',
        summaryFormat: 'json' // json, csv
    },

    // Security
    security: {
        redactPII: process.env.HS_REDACT_PII !== 'false',
        deleteTempFiles: process.env.HS_DELETE_TEMP !== 'false',
        encryptStateFiles: false // Future enhancement
    }
};