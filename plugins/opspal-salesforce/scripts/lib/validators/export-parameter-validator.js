#!/usr/bin/env node

/**
 * Export Parameter Validator
 *
 * Validates export parameters before execution to prevent memory issues
 * and recommend optimal export strategies.
 *
 * Usage:
 *   node export-parameter-validator.js <tool-input-json>
 *
 * Validation Checks:
 *   - Record count estimation
 *   - Field count in query
 *   - Memory limit projection
 *   - Recommended export mode (streaming vs batch)
 */

const RECORD_SIZE_ESTIMATE = 2048; // bytes per record (average)
const MEMORY_LIMIT_MB = 512; // safe memory limit
const STREAMING_THRESHOLD = 10000; // records

function parseToolInput(input) {
    try {
        return JSON.parse(input);
    } catch (e) {
        // If not JSON, treat as query string
        return { query: input };
    }
}

function estimateRecordCount(query) {
    // Simple heuristic: look for LIMIT clause
    const limitMatch = query.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
        return parseInt(limitMatch[1]);
    }
    // No LIMIT = potentially large export
    return 50000; // conservative estimate
}

function countFields(query) {
    // Extract field list from SELECT clause
    const selectMatch = query.match(/SELECT\s+(.*?)\s+FROM/i);
    if (!selectMatch) return 10; // default

    const fields = selectMatch[1];
    if (fields.trim() === '*') return 50; // estimate for SELECT *

    // Count commas + 1
    return fields.split(',').length;
}

function validateExport(toolInput) {
    const { query, params } = toolInput;

    if (!query) {
        return {
            status: 'PASS',
            message: 'No query parameter found, skipping validation'
        };
    }

    const recordCount = estimateRecordCount(query);
    const fieldCount = countFields(query);
    const estimatedSize = (recordCount * fieldCount * RECORD_SIZE_ESTIMATE) / (1024 * 1024); // MB

    const warnings = [];
    const recommendations = [];

    // Check if export is too large
    if (estimatedSize > MEMORY_LIMIT_MB) {
        warnings.push(`Estimated export size (${Math.round(estimatedSize)}MB) exceeds safe limit (${MEMORY_LIMIT_MB}MB)`);
        recommendations.push('Use streaming export with --use-bulk-api flag');
        recommendations.push('Consider adding LIMIT clause to reduce record count');
        recommendations.push('Select only required fields instead of SELECT *');
    }

    // Check if streaming recommended
    if (recordCount > STREAMING_THRESHOLD) {
        recommendations.push(`Record count (${recordCount}) exceeds streaming threshold`);
        recommendations.push('Recommend using bulk API for large exports');
    }

    // Check for SELECT *
    if (query.includes('SELECT *')) {
        warnings.push('SELECT * detected - may include unnecessary fields');
        recommendations.push('Specify explicit field list for better performance');
    }

    const status = warnings.length > 0 ? 'WARN' : 'PASS';

    return {
        status,
        estimatedRecords: recordCount,
        fieldCount,
        estimatedSizeMB: Math.round(estimatedSize),
        warnings,
        recommendations
    };
}

// CLI execution
if (require.main === module) {
    const toolInput = process.argv[2];

    if (!toolInput || toolInput === '--help') {
        console.log(`
Export Parameter Validator

Usage: node export-parameter-validator.js <tool-input-json>

Validates export parameters before execution to prevent memory issues.
`);
        process.exit(0);
    }

    const parsed = parseToolInput(toolInput);
    const result = validateExport(parsed);

    console.log(JSON.stringify(result, null, 2));

    // Exit with warning code if issues found (but don't block)
    process.exit(result.status === 'WARN' ? 0 : 0);
}

module.exports = { validateExport };
