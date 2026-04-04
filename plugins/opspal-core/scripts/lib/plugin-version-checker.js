#!/usr/bin/env node

/**
 * Plugin Version Checker
 *
 * Checks installed plugin versions against latest versions in GitHub
 * Uses caching to avoid rate limits and improve startup performance
 *
 * Features:
 * - GitHub API integration for latest versions
 * - 1-hour cache TTL to minimize API calls
 * - Graceful fallback on API failures
 * - Supports multiple plugins
 * - JSON output for hook integration
 *
 * Usage:
 *   node plugin-version-checker.js [--force-refresh] [--format=json|text]
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_FILE = path.join(require('os').homedir(), '.claude', 'plugin-versions-cache.json');
const GITHUB_API_BASE = 'https://api.github.com';
const REPO_OWNER = 'RevPalSFDC';
const REPO_NAME = 'opspal-plugin-internal-marketplace';
const PLUGINS_TO_CHECK = [
  'salesforce-plugin',
  'hubspot-plugin',
  'opspal-core',
  'developer-tools-plugin',
  'gtm-planning-plugin',
  'ai-consult-plugin'
];

// Parse command line arguments
const args = process.argv.slice(2);
const forceRefresh = args.includes('--force-refresh');
const format = args.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'json';

/**
 * Make HTTPS request with promise
 */
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const defaultOptions = {
      headers: {
        'User-Agent': 'OpsPal-Plugin-Version-Checker/1.0'
      }
    };

    const requestOptions = { ...defaultOptions, ...options };

    https.get(url, requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ statusCode: res.statusCode, data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Load cache from disk
 */
function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }

    const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const age = Date.now() - cacheData.timestamp;

    if (age < CACHE_TTL_MS && !forceRefresh) {
      return cacheData;
    }

    return null;
  } catch (err) {
    // Cache corrupted or unreadable, ignore
    return null;
  }
}

/**
 * Save cache to disk
 */
function saveCache(data) {
  try {
    const cacheDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const cacheData = {
      timestamp: Date.now(),
      versions: data
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (err) {
    // Silent fail - caching is optional
  }
}

/**
 * Get installed version for a plugin
 */
function getInstalledVersion(pluginName) {
  try {
    const pluginRoot = path.join(__dirname, '../../../', pluginName);
    const pluginJsonPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');

    if (!fs.existsSync(pluginJsonPath)) {
      return null;
    }

    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    return pluginJson.version;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch latest version from GitHub
 */
async function fetchLatestVersion(pluginName) {
  try {
    const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/.claude-plugins/${pluginName}/.claude-plugin/plugin.json`;

    const { data } = await httpsRequest(url);
    const response = JSON.parse(data);

    // GitHub API returns base64-encoded content
    const content = Buffer.from(response.content, 'base64').toString('utf8');
    const pluginJson = JSON.parse(content);

    return pluginJson.version;
  } catch (err) {
    // Silent fail - return null if we can't fetch
    return null;
  }
}

/**
 * Check all plugins for updates
 */
async function checkForUpdates() {
  // Try cache first
  const cached = loadCache();
  if (cached) {
    return cached.versions;
  }

  const results = [];

  for (const pluginName of PLUGINS_TO_CHECK) {
    const installed = getInstalledVersion(pluginName);

    if (!installed) {
      // Plugin not installed, skip
      continue;
    }

    const latest = await fetchLatestVersion(pluginName);

    if (!latest) {
      // Couldn't fetch latest, skip
      continue;
    }

    const hasUpdate = compareVersions(installed, latest) < 0;

    results.push({
      plugin: pluginName,
      installed,
      latest,
      hasUpdate
    });
  }

  // Save to cache
  saveCache(results);

  return results;
}

/**
 * Compare semantic versions
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }

  return 0;
}

/**
 * Format output for SessionStart hook (JSON)
 */
function formatJsonOutput(results) {
  const updates = results.filter(r => r.hasUpdate);

  if (updates.length === 0) {
    // No updates, return empty JSON (silent)
    return JSON.stringify({});
  }

  let message = '🔔 Plugin Updates Available:\\n';

  for (const update of updates) {
    message += `   • ${update.plugin}: ${update.installed} → ${update.latest}\\n`;
  }

  message += '\\nRun: /plugin update to upgrade';

  return JSON.stringify({
    systemMessage: message,
    metadata: {
      updatesAvailable: updates.length,
      updates: updates.map(u => ({
        plugin: u.plugin,
        from: u.installed,
        to: u.latest
      }))
    }
  });
}

/**
 * Format output for terminal (text)
 */
function formatTextOutput(results) {
  const updates = results.filter(r => r.hasUpdate);

  if (updates.length === 0) {
    console.log('✅ All plugins are up to date');
    return;
  }

  console.log('🔔 Plugin Updates Available:');
  for (const update of updates) {
    console.log(`   • ${update.plugin}: ${update.installed} → ${update.latest}`);
  }
  console.log('\nRun: /plugin update to upgrade');
}

/**
 * Main execution
 */
async function main() {
  try {
    const results = await checkForUpdates();

    if (format === 'json') {
      console.log(formatJsonOutput(results));
    } else {
      formatTextOutput(results);
    }

    process.exit(0);
  } catch (err) {
    // Silent fail on SessionStart to not block startup
    if (format === 'json') {
      console.log('{}');
    }
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  checkForUpdates,
  getInstalledVersion,
  fetchLatestVersion,
  compareVersions
};
