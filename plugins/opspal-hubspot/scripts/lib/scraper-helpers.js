/**
 * HubSpot UI Scraper Helper Library
 * Reusable utilities for browser automation scraping
 */

const fs = require('fs');
const path = require('path');

/**
 * Validate session storage state file
 * @param {string} storageStatePath - Path to session file
 * @param {Object} options - Validation options
 * @param {boolean} options.deep - Perform deep validation (test actual page access)
 * @param {string} options.portalId - Portal ID for deep validation
 * @returns {{valid: boolean, age: number|null, message: string}}
 */
function validateSession(storageStatePath, options = {}) {
  const { deep = false, portalId = null } = options;

  if (!fs.existsSync(storageStatePath)) {
    return {
      valid: false,
      age: null,
      message: 'No saved session found. Run with HEAD=1 to authenticate.'
    };
  }

  try {
    const stats = fs.statSync(storageStatePath);
    const ageMs = Date.now() - stats.mtimeMs;
    const ageHours = ageMs / (1000 * 60 * 60);

    // HubSpot sessions typically last 24 hours
    if (ageHours > 24) {
      return {
        valid: false,
        age: ageHours,
        message: `Session expired (${Math.floor(ageHours)} hours old). Re-authenticate with HEAD=1.`
      };
    }

    // Warn if session is getting old (>20 hours)
    if (ageHours > 20) {
      return {
        valid: true,
        age: ageHours,
        message: `⚠️  Session is ${Math.floor(ageHours)} hours old. May expire soon.`
      };
    }

    // Basic validation passed
    const basicResult = {
      valid: true,
      age: ageHours,
      message: `✅ Session valid (${Math.floor(ageHours)} hours old)`
    };

    // If deep validation not requested, return basic check
    if (!deep) {
      return basicResult;
    }

    // Note: Deep validation requires async, return basic check with note
    basicResult.message += ' (use validateSessionDeep for full validation)';
    return basicResult;

  } catch (error) {
    return {
      valid: false,
      age: null,
      message: `Error reading session file: ${error.message}`
    };
  }
}

/**
 * Deep session validation - tests actual integrations page access
 * @param {string} storageStatePath - Path to session file
 * @param {string} portalId - HubSpot portal ID
 * @param {Object} options - Validation options
 * @returns {Promise<{valid: boolean, authenticated: boolean, message: string, details: Object}>}
 */
async function validateSessionDeep(storageStatePath, portalId, options = {}) {
  const { chromium } = require('playwright');
  const { timeout = 15000, headless = true } = options;

  // First do basic validation
  const basicCheck = validateSession(storageStatePath);
  if (!basicCheck.valid) {
    return {
      valid: false,
      authenticated: false,
      message: basicCheck.message,
      details: { ageCheck: basicCheck }
    };
  }

  try {
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    // Attempt to access integrations page
    const integrationsUrl = `https://app.hubspot.com/settings/${portalId}/integrations`;

    console.log('🔍 Testing integrations page access...');
    const response = await page.goto(integrationsUrl, {
      waitUntil: 'networkidle',
      timeout
    });

    // Check if redirected to login
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      await browser.close();
      return {
        valid: false,
        authenticated: false,
        message: '❌ Session expired - redirected to login page',
        details: {
          ageCheck: basicCheck,
          redirectedTo: currentUrl,
          statusCode: response.status()
        }
      };
    }

    // Check for permission/access issues
    if (response.status() === 403 || response.status() === 401) {
      await browser.close();
      return {
        valid: false,
        authenticated: true,
        message: `❌ Access denied to integrations page (HTTP ${response.status()})`,
        details: {
          ageCheck: basicCheck,
          statusCode: response.status(),
          url: currentUrl
        }
      };
    }

    // Check if page loaded successfully
    if (response.status() !== 200) {
      await browser.close();
      return {
        valid: false,
        authenticated: true,
        message: `⚠️  Unexpected response (HTTP ${response.status()})`,
        details: {
          ageCheck: basicCheck,
          statusCode: response.status(),
          url: currentUrl
        }
      };
    }

    // Verify we can find integrations content
    const hasIntegrationsContent = await page.locator('text=/integration/i').first().isVisible({ timeout: 5000 })
      .catch(() => false);

    await browser.close();

    if (hasIntegrationsContent) {
      return {
        valid: true,
        authenticated: true,
        message: '✅ Session valid and integrations page accessible',
        details: {
          ageCheck: basicCheck,
          statusCode: response.status(),
          url: currentUrl,
          contentVerified: true
        }
      };
    }

    return {
      valid: false,
      authenticated: true,
      message: '⚠️  Page loaded but integrations content not found',
      details: {
        ageCheck: basicCheck,
        statusCode: response.status(),
        url: currentUrl,
        contentVerified: false
      }
    };

  } catch (error) {
    return {
      valid: false,
      authenticated: null,
      message: `❌ Error testing session: ${error.message}`,
      details: {
        ageCheck: basicCheck,
        error: error.message
      }
    };
  }
}

/**
 * Intelligent wait for element with multiple strategies
 * @param {Page} page - Playwright page object
 * @param {RegExp|string} pattern - Text pattern to find
 * @param {Object} options - Wait options
 * @returns {Promise<{found: boolean, element: Locator|null, strategy: string}>}
 */
async function intelligentWait(page, pattern, options = {}) {
  const {
    timeout = 10000,
    strategies = ['role', 'text', 'selector'],
    role = null
  } = options;

  // Strategy 1: Role + text (most stable)
  if (strategies.includes('role') && role) {
    try {
      const element = page.getByRole(role, { name: pattern });
      await element.waitFor({ state: 'visible', timeout: timeout / 3 });
      return { found: true, element, strategy: 'role+text' };
    } catch (e) {
      // Continue to next strategy
    }
  }

  // Strategy 2: Text only
  if (strategies.includes('text')) {
    try {
      const element = page.locator('*').filter({ hasText: pattern }).first();
      await element.waitFor({ state: 'visible', timeout: timeout / 3 });
      return { found: true, element, strategy: 'text' };
    } catch (e) {
      // Continue to next strategy
    }
  }

  // Strategy 3: CSS selector (least stable)
  if (strategies.includes('selector') && typeof pattern === 'string' && !pattern.startsWith('/')) {
    try {
      const element = page.locator(pattern).first();
      await element.waitFor({ state: 'visible', timeout: timeout / 3 });
      return { found: true, element, strategy: 'selector' };
    } catch (e) {
      // All strategies failed
    }
  }

  return { found: false, element: null, strategy: 'none' };
}

/**
 * Extract text from page with retries
 * @param {Page} page - Playwright page object
 * @param {RegExp|string} pattern - Pattern to match
 * @param {Object} options - Extraction options
 * @returns {Promise<string>}
 */
async function extractTextWithRetry(page, pattern, options = {}) {
  const { retries = 2, timeout = 5000 } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await intelligentWait(page, pattern, { timeout });

      if (result.found && result.element) {
        const text = await result.element.innerText({ timeout: 3000 });
        return text.trim();
      }
    } catch (error) {
      if (attempt === retries) {
        return 'Not found';
      }
      // Wait before retry
      await page.waitForTimeout(1000);
    }
  }

  return 'Error extracting';
}

/**
 * Clean up old CSV files, keep most recent N files
 * @param {string} directory - Directory containing CSV files
 * @param {string} pattern - File name pattern (e.g., 'sfdc-mappings-*.csv')
 * @param {number} keepCount - Number of recent files to keep
 */
function cleanupOldFiles(directory, pattern, keepCount = 3) {
  if (!fs.existsSync(directory)) {
    return;
  }

  const regex = new RegExp(pattern.replace('*', '(\\d+)'));
  const files = fs.readdirSync(directory)
    .filter(file => regex.test(file))
    .map(file => ({
      name: file,
      path: path.join(directory, file),
      mtime: fs.statSync(path.join(directory, file)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime); // Newest first

  // Keep newest N files, delete rest
  files.slice(keepCount).forEach(file => {
    try {
      fs.unlinkSync(file.path);
      console.log(`🗑️  Cleaned up old file: ${file.name}`);
    } catch (error) {
      console.warn(`Warning: Could not delete ${file.name}: ${error.message}`);
    }
  });
}

/**
 * Validate portal configuration
 * @param {Object} config - Portal config object
 * @param {Object} allPortals - All portals from config
 * @returns {{valid: boolean, message: string, suggestions: string[]}}
 */
function validatePortalConfig(config, allPortals) {
  if (!config) {
    return {
      valid: false,
      message: 'Portal configuration not found',
      suggestions: Object.keys(allPortals)
    };
  }

  const required = ['portalId', 'name'];
  const missing = required.filter(field => !config[field]);

  if (missing.length > 0) {
    return {
      valid: false,
      message: `Portal config missing required fields: ${missing.join(', ')}`,
      suggestions: []
    };
  }

  return {
    valid: true,
    message: 'Portal configuration valid',
    suggestions: []
  };
}

/**
 * Wait for network idle (no requests for N seconds)
 * @param {Page} page - Playwright page
 * @param {number} idleTime - Milliseconds of idle time required
 */
async function waitForNetworkIdle(page, idleTime = 500) {
  return page.waitForLoadState('networkidle', { timeout: 30000 });
}

/**
 * Safe click with retry and wait
 * @param {Locator} element - Playwright locator
 * @param {Object} options - Click options
 */
async function safeClick(element, options = {}) {
  const { retries = 2, delay = 1000 } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await element.waitFor({ state: 'visible', timeout: 5000 });
      await element.click();
      return true;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      await element.page().waitForTimeout(delay);
    }
  }
  return false;
}

module.exports = {
  validateSession,
  validateSessionDeep,
  intelligentWait,
  extractTextWithRetry,
  cleanupOldFiles,
  validatePortalConfig,
  waitForNetworkIdle,
  safeClick
};
