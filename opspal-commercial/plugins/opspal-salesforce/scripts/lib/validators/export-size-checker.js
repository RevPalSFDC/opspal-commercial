#!/usr/bin/env node

/**
 * Export Size Checker
 *
 * Checks if export will exceed memory limits and recommends streaming approach.
 *
 * Usage:
 *   node export-size-checker.js <bash-command>
 */

const MEMORY_LIMIT_MB = 512;
const LARGE_EXPORT_THRESHOLD = 10000;

function parseCommand(command) {
    // Extract query from sf data query command
    const queryMatch = command.match(/--query\s+["'](.+?)["']/);
    if (queryMatch) {
        return queryMatch[1];
    }
    return null;
}

function checkExportSize(command) {
    const query = parseCommand(command);

    if (!query) {
        return {
            status: 'PASS',
            message: 'No query found in command'
        };
    }

    // Check for bulk API flag
    const hasBulkApi = command.includes('--use-bulk-api') || command.includes('--bulk');

    // Check for LIMIT clause
    const limitMatch = query.match(/LIMIT\s+(\d+)/i);
    const hasLimit = !!limitMatch;
    const limit = hasLimit ? parseInt(limitMatch[1]) : null;

    const warnings = [];
    const recommendations = [];

    // Warn if large export without bulk API
    if (!hasLimit && !hasBulkApi) {
        warnings.push('Large export detected without LIMIT clause or bulk API flag');
        recommendations.push('Add LIMIT clause: LIMIT 10000');
        recommendations.push('Or use bulk API: sf data query ... --use-bulk-api');
    }

    if (hasLimit && limit > LARGE_EXPORT_THRESHOLD && !hasBulkApi) {
        warnings.push(`Large LIMIT (${limit}) without bulk API may cause timeout`);
        recommendations.push('Add --use-bulk-api flag for large exports');
    }

    return {
        status: warnings.length > 0 ? 'WARN' : 'PASS',
        hasBulkApi,
        hasLimit,
        limit,
        warnings,
        recommendations
    };
}

// CLI execution
if (require.main === module) {
    const command = process.argv[2];

    if (!command || command === '--help') {
        console.log(`
Export Size Checker

Usage: node export-size-checker.js <bash-command>

Checks if sf data query command will exceed memory limits.
`);
        process.exit(0);
    }

    const result = checkExportSize(command);
    console.log(JSON.stringify(result, null, 2));

    process.exit(0);
}

module.exports = { checkExportSize };
