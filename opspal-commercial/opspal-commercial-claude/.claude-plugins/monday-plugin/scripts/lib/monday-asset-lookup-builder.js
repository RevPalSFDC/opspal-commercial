#!/usr/bin/env node
/**
 * Monday.com Asset Lookup Builder
 *
 * Builds resource_id → filename lookup tables from downloaded assets folder.
 * Supports multiple matching strategies for file catalog generation.
 *
 * Usage:
 *   const { buildAssetLookup, matchUrlToFile } = require('./monday-asset-lookup-builder');
 *
 *   // Build lookup from assets folder
 *   const lookup = buildAssetLookup('./monday-downloads');
 *
 *   // Match a Monday.com URL to local file
 *   const filename = matchUrlToFile('https://monday.com/resources/123456/file.pdf', lookup);
 *
 * CLI Usage:
 *   node monday-asset-lookup-builder.js build ./monday-downloads
 *   node monday-asset-lookup-builder.js match ./monday-downloads "https://monday.com/resources/123/file.pdf"
 *   node monday-asset-lookup-builder.js stats ./monday-downloads
 *
 * @module monday-asset-lookup-builder
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Patterns to extract resource_id from Monday.com URLs
 */
const MONDAY_URL_PATTERNS = [
  /monday\.com\/resources\/(\d+)\//,
  /files\.monday\.com\/(\d+)\//,
  /monday-files\.com\/(\d+)\//
];

/**
 * Asset filename pattern: {resource_id}_{original_filename}
 */
const ASSET_FILENAME_PATTERN = /^(\d+)_(.+)$/;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Build resource_id → filename lookup from assets folder
 *
 * @param {string} assetsPath - Path to downloaded assets folder
 * @param {Object} options - Build options
 * @param {boolean} options.includeHash - Calculate file hashes (slower but enables dedup)
 * @param {boolean} options.includeSize - Include file sizes
 * @returns {Object} Lookup object with resource_id keys
 */
function buildAssetLookup(assetsPath, options = {}) {
  const { includeHash = false, includeSize = true } = options;

  if (!fs.existsSync(assetsPath)) {
    throw new Error(`Assets folder not found: ${assetsPath}`);
  }

  const lookup = {};
  const stats = {
    totalFiles: 0,
    matchedPattern: 0,
    unmatchedPattern: 0,
    duplicateIds: 0
  };

  const files = fs.readdirSync(assetsPath);

  for (const filename of files) {
    // Skip hidden files and directories
    if (filename.startsWith('.')) {
      continue;
    }

    const filePath = path.join(assetsPath, filename);
    const fileStat = fs.statSync(filePath);

    if (!fileStat.isFile()) {
      continue;
    }

    stats.totalFiles++;

    // Try to extract resource_id from filename
    const match = filename.match(ASSET_FILENAME_PATTERN);

    if (match) {
      const resourceId = match[1];
      const originalFilename = match[2];

      // Check for duplicates
      if (lookup[resourceId]) {
        stats.duplicateIds++;
        console.warn(`Warning: Duplicate resource_id ${resourceId}. Keeping first occurrence.`);
        continue;
      }

      const entry = {
        filename,
        originalFilename,
        resourceId,
        path: filePath
      };

      if (includeSize) {
        entry.size = fileStat.size;
        entry.sizeFormatted = formatFileSize(fileStat.size);
      }

      if (includeHash) {
        entry.hash = calculateFileHash(filePath);
      }

      lookup[resourceId] = entry;
      stats.matchedPattern++;
    } else {
      stats.unmatchedPattern++;
      console.warn(`Warning: File does not match naming pattern: ${filename}`);
    }
  }

  return {
    lookup,
    stats,
    assetsPath: path.resolve(assetsPath)
  };
}

/**
 * Extract resource_id from Monday.com URL
 *
 * @param {string} url - Monday.com file URL
 * @returns {string|null} Resource ID or null if not found
 */
function extractResourceId(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  for (const pattern of MONDAY_URL_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Match a Monday.com URL to a local file
 *
 * @param {string} url - Monday.com file URL
 * @param {Object} lookupResult - Result from buildAssetLookup()
 * @returns {Object|null} File entry or null if not found
 */
function matchUrlToFile(url, lookupResult) {
  const { lookup } = lookupResult;
  const resourceId = extractResourceId(url);

  if (!resourceId) {
    return null;
  }

  return lookup[resourceId] || null;
}

/**
 * Batch match multiple URLs to files
 *
 * @param {string[]} urls - Array of Monday.com URLs
 * @param {Object} lookupResult - Result from buildAssetLookup()
 * @returns {Object} Match results with statistics
 */
function batchMatchUrls(urls, lookupResult) {
  const results = {
    matches: [],
    unmatched: [],
    stats: {
      total: urls.length,
      matched: 0,
      unmatched: 0,
      matchRate: 0
    }
  };

  for (const url of urls) {
    const match = matchUrlToFile(url, lookupResult);

    if (match) {
      results.matches.push({
        url,
        resourceId: match.resourceId,
        filename: match.filename,
        path: match.path
      });
      results.stats.matched++;
    } else {
      const resourceId = extractResourceId(url);
      results.unmatched.push({
        url,
        resourceId,
        reason: resourceId ? 'Resource ID not found in assets' : 'Could not extract resource ID'
      });
      results.stats.unmatched++;
    }
  }

  results.stats.matchRate = results.stats.total > 0
    ? ((results.stats.matched / results.stats.total) * 100).toFixed(1) + '%'
    : 'N/A';

  return results;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate MD5 hash of file
 *
 * @param {string} filePath - Path to file
 * @returns {string} MD5 hash
 */
function calculateFileHash(filePath) {
  const hash = crypto.createHash('md5');
  const fileBuffer = fs.readFileSync(filePath);
  hash.update(fileBuffer);
  return hash.digest('hex');
}

/**
 * Format file size in human-readable format
 *
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Generate lookup statistics report
 *
 * @param {Object} lookupResult - Result from buildAssetLookup()
 * @returns {string} Formatted report
 */
function generateStatsReport(lookupResult) {
  const { lookup, stats, assetsPath } = lookupResult;

  const lines = [
    '=' .repeat(60),
    'MONDAY.COM ASSET LOOKUP STATISTICS',
    '=' .repeat(60),
    '',
    `Assets Path: ${assetsPath}`,
    '',
    'FILE STATISTICS',
    '-'.repeat(40),
    `  Total files scanned: ${stats.totalFiles}`,
    `  Matched pattern: ${stats.matchedPattern}`,
    `  Unmatched pattern: ${stats.unmatchedPattern}`,
    `  Duplicate IDs: ${stats.duplicateIds}`,
    ''
  ];

  // Calculate total size if available
  const entries = Object.values(lookup);
  if (entries.length > 0 && entries[0].size !== undefined) {
    const totalSize = entries.reduce((sum, e) => sum + (e.size || 0), 0);
    lines.push('SIZE STATISTICS');
    lines.push('-'.repeat(40));
    lines.push(`  Total size: ${formatFileSize(totalSize)}`);
    lines.push(`  Average size: ${formatFileSize(totalSize / entries.length)}`);
    lines.push('');
  }

  // Sample entries
  const sampleCount = Math.min(5, entries.length);
  if (sampleCount > 0) {
    lines.push('SAMPLE ENTRIES');
    lines.push('-'.repeat(40));

    for (let i = 0; i < sampleCount; i++) {
      const entry = entries[i];
      lines.push(`  ${entry.resourceId} → ${entry.filename}`);
    }

    if (entries.length > sampleCount) {
      lines.push(`  ... and ${entries.length - sampleCount} more`);
    }
    lines.push('');
  }

  lines.push('=' .repeat(60));

  return lines.join('\n');
}

/**
 * Export lookup to JSON file
 *
 * @param {Object} lookupResult - Result from buildAssetLookup()
 * @param {string} outputPath - Output file path
 */
function exportLookupToJson(lookupResult, outputPath) {
  const exportData = {
    generatedAt: new Date().toISOString(),
    assetsPath: lookupResult.assetsPath,
    stats: lookupResult.stats,
    entries: Object.entries(lookupResult.lookup).map(([resourceId, entry]) => ({
      resourceId,
      filename: entry.filename,
      originalFilename: entry.originalFilename,
      size: entry.size,
      hash: entry.hash
    }))
  };

  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`Lookup exported to: ${outputPath}`);
}

/**
 * Import lookup from JSON file
 *
 * @param {string} jsonPath - Path to JSON file
 * @returns {Object} Lookup result in same format as buildAssetLookup()
 */
function importLookupFromJson(jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const lookup = {};
  for (const entry of data.entries) {
    lookup[entry.resourceId] = {
      filename: entry.filename,
      originalFilename: entry.originalFilename,
      resourceId: entry.resourceId,
      path: path.join(data.assetsPath, entry.filename),
      size: entry.size,
      hash: entry.hash
    };
  }

  return {
    lookup,
    stats: data.stats,
    assetsPath: data.assetsPath
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  buildAssetLookup,
  extractResourceId,
  matchUrlToFile,
  batchMatchUrls,
  generateStatsReport,
  exportLookupToJson,
  importLookupFromJson,
  calculateFileHash,
  formatFileSize,
  MONDAY_URL_PATTERNS,
  ASSET_FILENAME_PATTERN
};

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'build': {
      const assetsPath = args[1];
      if (!assetsPath) {
        console.error('Usage: node monday-asset-lookup-builder.js build <assets-path> [--hash] [--json <output>]');
        process.exit(1);
      }

      const includeHash = args.includes('--hash');
      const jsonIndex = args.indexOf('--json');
      const jsonOutput = jsonIndex > -1 ? args[jsonIndex + 1] : null;

      try {
        console.log(`Building asset lookup from: ${assetsPath}`);
        const result = buildAssetLookup(assetsPath, { includeHash });

        console.log(generateStatsReport(result));

        if (jsonOutput) {
          exportLookupToJson(result, jsonOutput);
        }
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
      break;
    }

    case 'match': {
      const assetsPath = args[1];
      const url = args[2];

      if (!assetsPath || !url) {
        console.error('Usage: node monday-asset-lookup-builder.js match <assets-path> <url>');
        process.exit(1);
      }

      try {
        const result = buildAssetLookup(assetsPath);
        const match = matchUrlToFile(url, result);

        if (match) {
          console.log('Match found:');
          console.log(`  Resource ID: ${match.resourceId}`);
          console.log(`  Filename: ${match.filename}`);
          console.log(`  Path: ${match.path}`);
          if (match.size) {
            console.log(`  Size: ${match.sizeFormatted}`);
          }
        } else {
          const resourceId = extractResourceId(url);
          console.log('No match found');
          console.log(`  Extracted Resource ID: ${resourceId || 'Could not extract'}`);
          process.exit(1);
        }
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
      break;
    }

    case 'stats': {
      const assetsPath = args[1];
      if (!assetsPath) {
        console.error('Usage: node monday-asset-lookup-builder.js stats <assets-path>');
        process.exit(1);
      }

      try {
        const result = buildAssetLookup(assetsPath, { includeSize: true });
        console.log(generateStatsReport(result));
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
      break;
    }

    case 'export': {
      const assetsPath = args[1];
      const outputPath = args[2];

      if (!assetsPath || !outputPath) {
        console.error('Usage: node monday-asset-lookup-builder.js export <assets-path> <output.json>');
        process.exit(1);
      }

      try {
        const result = buildAssetLookup(assetsPath, { includeSize: true, includeHash: true });
        exportLookupToJson(result, outputPath);
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
      break;
    }

    default:
      console.log(`
Monday.com Asset Lookup Builder

Builds resource_id → filename lookup tables from downloaded assets.

Usage: node monday-asset-lookup-builder.js <command> [args]

Commands:
  build <assets-path> [--hash] [--json <output>]
    Build lookup from assets folder
    --hash: Include MD5 hashes (slower)
    --json: Export to JSON file

  match <assets-path> <url>
    Match a Monday.com URL to a local file

  stats <assets-path>
    Show statistics about assets folder

  export <assets-path> <output.json>
    Export full lookup to JSON (includes hashes)

Examples:
  node monday-asset-lookup-builder.js build ./monday-downloads
  node monday-asset-lookup-builder.js match ./monday-downloads "https://monday.com/resources/123/file.pdf"
  node monday-asset-lookup-builder.js stats ./monday-downloads
  node monday-asset-lookup-builder.js export ./monday-downloads ./lookup.json

Asset Naming Convention:
  Files should be named: {resource_id}_{original_filename}
  Example: 1458720369123_Contract_2024.pdf
      `);
  }
}
