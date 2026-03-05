#!/usr/bin/env node

/**
 * Metadata Reference Resolver
 *
 * Converts dashboard report references between ID and FolderName/DeveloperName formats.
 * Prevents deployment errors like "Dashboard requires report references in format 'FolderName/DeveloperName'".
 *
 * Root Cause Addressed: Reflection cohort FP-009
 * - Issue: Dashboard deployment requires 'FolderName/DeveloperName' format, not IDs
 * - Example: Using '00O123456' instead of 'Sales_Reports/Pipeline_Report'
 * - Impact: 1 hour wasted per occurrence, $10K annual ROI
 *
 * Usage:
 *   const resolver = require('./metadata-reference-resolver');
 *
 *   // Convert ID to FolderName/DeveloperName
 *   const ref = await resolver.idToReference(orgAlias, '00O1234567890ABC');
 *   // Returns: 'Sales_Reports/Pipeline_Report'
 *
 *   // Convert FolderName/DeveloperName to ID
 *   const id = await resolver.referenceToId(orgAlias, 'Sales_Reports/Pipeline_Report');
 *   // Returns: '00O1234567890ABC'
 *
 * @module metadata-reference-resolver
 * @version 1.0.0
 * @created 2025-10-22
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Cache for report metadata
let reportCache = {};
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get cache file path
 *
 * @param {string} orgAlias - Salesforce org alias
 * @returns {string} Path to cache file
 */
function getCachePath(orgAlias) {
  const cacheDir = path.join('/tmp', 'sf-metadata-cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, `${orgAlias}-reports.json`);
}

/**
 * Load cache from disk
 *
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Object} Cached data or empty object
 */
function loadCache(orgAlias) {
  const cachePath = getCachePath(orgAlias);

  if (fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

      // Check if cache is stale
      if (data.timestamp) {
        const cacheAge = Date.now() - new Date(data.timestamp).getTime();
        if (cacheAge < CACHE_TTL) {
          return data;
        }
      }
    } catch (error) {
      // Cache corrupted, will rebuild
    }
  }

  return {
    orgAlias,
    timestamp: new Date().toISOString(),
    reports: {}
  };
}

/**
 * Save cache to disk
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {Object} cacheData - Data to cache
 */
function saveCache(orgAlias, cacheData) {
  const cachePath = getCachePath(orgAlias);
  cacheData.timestamp = new Date().toISOString();
  fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
}

/**
 * Query all reports from Salesforce
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {boolean} useCache - Whether to use cache (default: true)
 * @returns {Array} Array of report objects
 */
function queryAllReports(orgAlias, useCache = true) {
  // Check cache first
  if (useCache) {
    const cache = loadCache(orgAlias);
    if (Object.keys(cache.reports).length > 0) {
      return Object.values(cache.reports);
    }
  }

  // Query Salesforce
  const query = `SELECT Id, DeveloperName, FolderName FROM Report ORDER BY FolderName, DeveloperName`;

  try {
    const cmd = `sf data query --query "${query}" --target-org ${orgAlias} --json`;
    const result = JSON.parse(execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }));

    if (result.status !== 0 || !result.result || !result.result.records) {
      throw new Error(`Query failed: ${result.message || 'Unknown error'}`);
    }

    const reports = result.result.records;

    // Update cache
    const cache = { orgAlias, reports: {} };
    reports.forEach(report => {
      cache.reports[report.Id] = report;
    });
    saveCache(orgAlias, cache);

    return reports;

  } catch (error) {
    throw new Error(`Error querying reports: ${error.message}`);
  }
}

/**
 * Convert report ID to FolderName/DeveloperName reference
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} reportId - Report ID (e.g., '00O123456789ABC')
 * @param {boolean} useCache - Whether to use cache (default: true)
 * @returns {string} Reference in format 'FolderName/DeveloperName'
 */
function idToReference(orgAlias, reportId, useCache = true) {
  const reports = queryAllReports(orgAlias, useCache);
  const report = reports.find(r => r.Id === reportId);

  if (!report) {
    throw new Error(`Report not found: ${reportId}`);
  }

  return `${report.FolderName}/${report.DeveloperName}`;
}

/**
 * Convert FolderName/DeveloperName reference to report ID
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} reference - Reference in format 'FolderName/DeveloperName'
 * @param {boolean} useCache - Whether to use cache (default: true)
 * @returns {string} Report ID
 */
function referenceToId(orgAlias, reference, useCache = true) {
  const parts = reference.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid reference format: ${reference} (expected FolderName/DeveloperName)`);
  }

  const [folderName, developerName] = parts;
  const reports = queryAllReports(orgAlias, useCache);
  const report = reports.find(r =>
    r.FolderName === folderName && r.DeveloperName === developerName
  );

  if (!report) {
    throw new Error(`Report not found: ${reference}`);
  }

  return report.Id;
}

/**
 * Detect reference format
 *
 * @param {string} reference - Report reference string
 * @returns {string} Format: 'id' or 'folder_developer_name'
 */
function detectFormat(reference) {
  // Salesforce Report IDs start with '00O' and are 15 or 18 characters
  if (/^00O[a-zA-Z0-9]{12}/.test(reference)) {
    return 'id';
  }

  // FolderName/DeveloperName format
  if (reference.includes('/')) {
    return 'folder_developer_name';
  }

  return 'unknown';
}

/**
 * Convert report reference to dashboard-compatible format
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} reference - Report reference (ID or FolderName/DeveloperName)
 * @param {boolean} useCache - Whether to use cache (default: true)
 * @returns {string} Dashboard-compatible reference (FolderName/DeveloperName)
 */
function toDashboardFormat(orgAlias, reference, useCache = true) {
  const format = detectFormat(reference);

  if (format === 'folder_developer_name') {
    // Already in correct format
    return reference;
  }

  if (format === 'id') {
    // Convert ID to FolderName/DeveloperName
    return idToReference(orgAlias, reference, useCache);
  }

  throw new Error(`Unknown reference format: ${reference}`);
}

/**
 * Batch convert multiple references
 *
 * @param {string} orgAlias - Salesforce org alias
 * @param {Array} references - Array of report references
 * @param {boolean} useCache - Whether to use cache (default: true)
 * @returns {Array} Array of converted references
 */
function batchConvert(orgAlias, references, useCache = true) {
  // Pre-load all reports once
  queryAllReports(orgAlias, useCache);

  // Convert all references
  return references.map(ref => {
    try {
      return toDashboardFormat(orgAlias, ref, true); // Use cached data
    } catch (error) {
      return { error: error.message, original: ref };
    }
  });
}

/**
 * Clear cache for an org
 *
 * @param {string} orgAlias - Salesforce org alias
 */
function clearCache(orgAlias) {
  const cachePath = getCachePath(orgAlias);
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }
}

// Export functions
module.exports = {
  idToReference,
  referenceToId,
  detectFormat,
  toDashboardFormat,
  batchConvert,
  queryAllReports,
  clearCache
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: node metadata-reference-resolver.js <org-alias> <reference> [--no-cache]');
    console.log('');
    console.log('Examples:');
    console.log('  node metadata-reference-resolver.js myorg 00O1234567890ABC');
    console.log('  node metadata-reference-resolver.js myorg Sales_Reports/Pipeline_Report');
    process.exit(1);
  }

  const orgAlias = args[0];
  const reference = args[1];
  const useCache = !args.includes('--no-cache');

  try {
    const format = detectFormat(reference);
    console.log(`Detected format: ${format}`);

    const result = toDashboardFormat(orgAlias, reference, useCache);
    console.log(`Dashboard format: ${result}`);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}
