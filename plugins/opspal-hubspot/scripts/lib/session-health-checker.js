/**
 * Session Health Checker
 *
 * Validates HubSpot browser session health before Playwright operations.
 * Detects expired cookies and prompts for re-authentication.
 *
 * Related reflections: 3906f5a8
 * ROI: $4,500/yr
 *
 * @module session-health-checker
 */

const fs = require('fs');
const path = require('path');

// HubSpot session indicators
const SESSION_INDICATORS = {
  // URLs that indicate logged-in state
  validUrls: [
    '/contacts/',
    '/deals/',
    '/companies/',
    '/reports-dashboard/',
    '/automation/',
    '/workflows/',
    '/settings/'
  ],

  // URLs that indicate login required
  loginUrls: [
    '/login',
    '/oauth/',
    '/signin',
    '/authenticate'
  ],

  // DOM elements that indicate logged-in state
  loggedInSelectors: [
    '[data-test-id="user-menu"]',
    '.private-user-menu',
    '[data-selenium="account-menu"]',
    '.navbar-user-menu'
  ],

  // DOM elements that indicate login page
  loginPageSelectors: [
    '[data-test-id="login-form"]',
    '#username',
    '#password',
    '.login-container',
    '[data-selenium="email-input"]'
  ]
};

// Session storage paths
const SESSION_PATHS = {
  default: path.join(process.env.HOME || '', '.claude', 'hubspot-sessions'),
  cookies: 'cookies.json',
  localStorage: 'localStorage.json',
  sessionState: 'session-state.json'
};

/**
 * Check if a URL indicates a logged-in state
 * @param {string} url - Current page URL
 * @returns {Object} URL analysis result
 */
function analyzeUrl(url) {
  const result = {
    url,
    isLoggedIn: false,
    isLoginPage: false,
    needsAuth: false,
    indicators: []
  };

  if (!url) {
    result.needsAuth = true;
    result.indicators.push('No URL provided');
    return result;
  }

  const urlLower = url.toLowerCase();

  // Check for login page indicators
  for (const loginUrl of SESSION_INDICATORS.loginUrls) {
    if (urlLower.includes(loginUrl)) {
      result.isLoginPage = true;
      result.needsAuth = true;
      result.indicators.push(`URL contains login indicator: ${loginUrl}`);
    }
  }

  // Check for logged-in page indicators
  for (const validUrl of SESSION_INDICATORS.validUrls) {
    if (urlLower.includes(validUrl)) {
      result.isLoggedIn = true;
      result.indicators.push(`URL contains logged-in indicator: ${validUrl}`);
    }
  }

  // If neither, assume needs auth
  if (!result.isLoggedIn && !result.isLoginPage) {
    result.needsAuth = true;
    result.indicators.push('URL does not match known logged-in patterns');
  }

  return result;
}

/**
 * Parse cookie data from browser
 * @param {Object[]} cookies - Array of cookie objects
 * @returns {Object} Cookie analysis
 */
function analyzeCookies(cookies) {
  const result = {
    hasCookies: false,
    hasAuthCookies: false,
    expired: [],
    valid: [],
    summary: {}
  };

  if (!cookies || !Array.isArray(cookies)) {
    return result;
  }

  result.hasCookies = cookies.length > 0;

  const now = Date.now() / 1000;
  const authCookiePatterns = [
    /hubspot/i,
    /csrf/i,
    /session/i,
    /auth/i,
    /token/i,
    /__hs/i
  ];

  for (const cookie of cookies) {
    const isAuthCookie = authCookiePatterns.some(p => p.test(cookie.name));

    if (cookie.expires && cookie.expires < now) {
      result.expired.push({
        name: cookie.name,
        expiredAt: new Date(cookie.expires * 1000).toISOString(),
        isAuthCookie
      });
    } else {
      result.valid.push({
        name: cookie.name,
        expiresAt: cookie.expires
          ? new Date(cookie.expires * 1000).toISOString()
          : 'session',
        isAuthCookie
      });

      if (isAuthCookie) {
        result.hasAuthCookies = true;
      }
    }
  }

  result.summary = {
    total: cookies.length,
    valid: result.valid.length,
    expired: result.expired.length,
    authCookies: result.valid.filter(c => c.isAuthCookie).length,
    expiredAuthCookies: result.expired.filter(c => c.isAuthCookie).length
  };

  return result;
}

/**
 * Load saved session state
 * @param {string} portalId - HubSpot portal ID
 * @returns {Object|null} Saved session state
 */
function loadSessionState(portalId) {
  const sessionDir = path.join(SESSION_PATHS.default, portalId || 'default');
  const statePath = path.join(sessionDir, SESSION_PATHS.sessionState);

  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(statePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

/**
 * Save session state
 * @param {string} portalId - HubSpot portal ID
 * @param {Object} state - Session state to save
 */
function saveSessionState(portalId, state) {
  const sessionDir = path.join(SESSION_PATHS.default, portalId || 'default');

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const statePath = path.join(sessionDir, SESSION_PATHS.sessionState);
  fs.writeFileSync(statePath, JSON.stringify({
    ...state,
    savedAt: new Date().toISOString()
  }, null, 2));
}

/**
 * Generate session check instructions for Playwright
 * @returns {Object} Playwright check configuration
 */
function generatePlaywrightCheck() {
  return {
    // Navigation check
    navigationCheck: {
      description: 'Navigate to HubSpot and check URL',
      steps: [
        'Navigate to https://app.hubspot.com/',
        'Wait for navigation to complete',
        'Check current URL for login indicators'
      ]
    },

    // Element check
    elementCheck: {
      loggedInSelectors: SESSION_INDICATORS.loggedInSelectors,
      loginPageSelectors: SESSION_INDICATORS.loginPageSelectors,
      description: 'Check for logged-in or login page elements'
    },

    // Cookie validation
    cookieCheck: {
      description: 'Extract and validate cookies',
      requiredPatterns: [
        '__hs_cookie_cat_pref',
        'hubspotutk',
        '__hstc'
      ]
    }
  };
}

/**
 * Check session health with all available data
 * @param {Object} data - Session data to check
 * @param {string} data.url - Current page URL
 * @param {Object[]} data.cookies - Browser cookies
 * @param {Object} data.elements - DOM element presence
 * @returns {Object} Health check result
 */
function checkSessionHealth(data = {}) {
  const result = {
    healthy: false,
    timestamp: new Date().toISOString(),
    checks: {},
    issues: [],
    recommendations: []
  };

  // URL check
  if (data.url) {
    result.checks.url = analyzeUrl(data.url);
    if (result.checks.url.needsAuth) {
      result.issues.push('URL indicates authentication required');
    }
  }

  // Cookie check
  if (data.cookies) {
    result.checks.cookies = analyzeCookies(data.cookies);

    if (!result.checks.cookies.hasAuthCookies) {
      result.issues.push('No authentication cookies found');
    }

    if (result.checks.cookies.summary.expiredAuthCookies > 0) {
      result.issues.push(`${result.checks.cookies.summary.expiredAuthCookies} authentication cookie(s) expired`);
    }
  }

  // Element check
  if (data.elements) {
    result.checks.elements = {
      hasLoggedInElements: data.elements.loggedIn?.some(Boolean),
      hasLoginPageElements: data.elements.loginPage?.some(Boolean)
    };

    if (result.checks.elements.hasLoginPageElements) {
      result.issues.push('Login page elements detected');
    }

    if (!result.checks.elements.hasLoggedInElements) {
      result.issues.push('Logged-in UI elements not found');
    }
  }

  // Determine overall health
  result.healthy = result.issues.length === 0;

  // Generate recommendations
  if (!result.healthy) {
    result.recommendations.push(
      'Re-authenticate with HubSpot',
      'Steps: 1) Open browser to app.hubspot.com',
      '       2) Complete login flow',
      '       3) Verify dashboard loads',
      '       4) Re-run the automation'
    );

    if (result.checks.cookies?.summary.expiredAuthCookies > 0) {
      result.recommendations.push(
        'Session cookies have expired. A fresh login is required.'
      );
    }
  } else {
    result.recommendations.push('Session appears healthy - proceed with automation');
  }

  return result;
}

/**
 * Create pre-flight check configuration
 * @param {Object} options - Configuration options
 * @returns {Object} Pre-flight configuration
 */
function createPreflightConfig(options = {}) {
  const portalId = options.portalId || process.env.HUBSPOT_PORTAL_ID;

  return {
    portalId,
    checks: {
      url: true,
      cookies: true,
      elements: true
    },
    timeout: options.timeout || 30000,
    retryOnFailure: options.retryOnFailure || false,
    maxRetries: options.maxRetries || 1,
    onAuthRequired: options.onAuthRequired || 'fail', // 'fail', 'prompt', 'skip'

    // Playwright-specific
    navigationUrl: `https://app.hubspot.com/contacts/${portalId}/`,
    waitForSelector: SESSION_INDICATORS.loggedInSelectors[0],
    waitTimeout: options.waitTimeout || 10000
  };
}

/**
 * Validate environment for HubSpot operations
 * @returns {Object} Environment validation result
 */
function validateEnvironment() {
  const result = {
    valid: true,
    checks: {},
    missing: []
  };

  // Check for portal ID
  const portalId = process.env.HUBSPOT_PORTAL_ID;
  result.checks.portalId = {
    present: !!portalId,
    value: portalId ? `${portalId.substring(0, 4)}...` : null
  };
  if (!portalId) {
    result.missing.push('HUBSPOT_PORTAL_ID');
  }

  // Check for API key (optional for browser operations)
  const apiKey = process.env.HUBSPOT_API_KEY || process.env.HUBSPOT_ACCESS_TOKEN;
  result.checks.apiKey = {
    present: !!apiKey,
    type: process.env.HUBSPOT_ACCESS_TOKEN ? 'access_token' : 'api_key'
  };

  // Check for session directory
  const sessionDir = path.join(SESSION_PATHS.default, portalId || 'default');
  result.checks.sessionDir = {
    exists: fs.existsSync(sessionDir),
    path: sessionDir
  };

  result.valid = result.missing.length === 0;

  return result;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'check-url':
      if (!args[1]) {
        console.error('Usage: session-health-checker.js check-url <url>');
        process.exit(1);
      }
      const urlResult = analyzeUrl(args[1]);
      console.log(JSON.stringify(urlResult, null, 2));
      process.exit(urlResult.needsAuth ? 1 : 0);
      break;

    case 'check-cookies':
      if (!args[1]) {
        console.error('Usage: session-health-checker.js check-cookies <cookies-json-path>');
        process.exit(1);
      }
      const cookies = JSON.parse(fs.readFileSync(args[1], 'utf8'));
      const cookieResult = analyzeCookies(cookies);
      console.log(JSON.stringify(cookieResult, null, 2));
      process.exit(cookieResult.hasAuthCookies ? 0 : 1);
      break;

    case 'check-env':
      const envResult = validateEnvironment();
      console.log(JSON.stringify(envResult, null, 2));
      process.exit(envResult.valid ? 0 : 1);
      break;

    case 'preflight-config':
      const portalId = args[1] || process.env.HUBSPOT_PORTAL_ID;
      const config = createPreflightConfig({ portalId });
      console.log(JSON.stringify(config, null, 2));
      break;

    case 'playwright-check':
      console.log(JSON.stringify(generatePlaywrightCheck(), null, 2));
      break;

    default:
      console.log(`HubSpot Session Health Checker

Usage:
  session-health-checker.js check-url <url>             Check if URL indicates login required
  session-health-checker.js check-cookies <json-path>   Analyze cookies for auth validity
  session-health-checker.js check-env                   Validate environment configuration
  session-health-checker.js preflight-config [portal]   Generate preflight check configuration
  session-health-checker.js playwright-check            Get Playwright check instructions

Environment Variables:
  HUBSPOT_PORTAL_ID       HubSpot portal/account ID
  HUBSPOT_ACCESS_TOKEN    HubSpot access token (optional)
  HUBSPOT_API_KEY         HubSpot API key (optional)

Session Detection:
  - Analyzes current URL for login indicators
  - Validates authentication cookies
  - Checks for logged-in UI elements

Examples:
  # Check if a URL needs authentication
  node session-health-checker.js check-url "https://app.hubspot.com/contacts/12345678"

  # Validate environment before automation
  node session-health-checker.js check-env

  # Get Playwright check configuration
  node session-health-checker.js playwright-check
`);
  }
}

module.exports = {
  SESSION_INDICATORS,
  analyzeUrl,
  analyzeCookies,
  loadSessionState,
  saveSessionState,
  generatePlaywrightCheck,
  checkSessionHealth,
  createPreflightConfig,
  validateEnvironment
};
