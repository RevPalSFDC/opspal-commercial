#!/usr/bin/env node

/**
 * Submit Reflection to Supabase (Centralized - opspal-core)
 *
 * Purpose: Submit session reflection JSON to centralized Supabase database
 * Usage: node scripts/lib/submit-reflection.js <path-to-reflection.json>
 *
 * This is the CANONICAL location for the reflection submission script.
 * All plugins should use this version via opspal-core.
 *
 * Features:
 * - Extracts key metrics from reflection JSON
 * - Pre-flight credential validation with connection testing
 * - Data quality validation before submission
 * - Provides detailed success/failure feedback
 *
 * Environment Variables:
 *   SUPABASE_URL - Supabase project URL (required)
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (recommended - bypasses RLS)
 *   SUPABASE_ANON_KEY - Anonymous key (fallback - may fail due to RLS)
 *   USER_EMAIL - Optional: for attribution
 *   REFLECT_DEBUG - Set to "1" for verbose debug output
 *
 * Note: SUPABASE_SERVICE_ROLE_KEY is strongly recommended. The anonymous key
 * (SUPABASE_ANON_KEY) may fail to write reflections due to Row Level Security
 * (RLS) policies on the reflections table.
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Error (missing config, invalid file, network failure)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { URL } = require('url');

// Early environment validation (warn-only)
try {
  const startupValidatorPath = path.join(__dirname, 'startup-validator.js');
  if (fs.existsSync(startupValidatorPath)) {
    const { validateForReflections } = require(startupValidatorPath);
    validateForReflections();
  }
} catch (e) {
  // Silently continue if validator not available
}

const ENV_FILE_KEYS = new Set();

function applyEnvValue(key, value, allowOverride) {
  const hasEnv = Object.prototype.hasOwnProperty.call(process.env, key);
  if (!hasEnv || (allowOverride && ENV_FILE_KEYS.has(key))) {
    process.env[key] = value;
    ENV_FILE_KEYS.add(key);
  }
}

function loadEnvFile(filePath, allowOverride) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const match = trimmed.match(/^(?:export\\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      return;
    }

    const key = match[1];
    let value = match[2] || '';
    value = value.trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    applyEnvValue(key, value, allowOverride);
  });

  return true;
}

function loadEnvFromProjectRoot(startDir) {
  let current = startDir;
  for (let depth = 0; depth < 10; depth++) {
    const envPath = path.join(current, '.env');
    const envLocalPath = path.join(current, '.env.local');
    if (fs.existsSync(envPath) || fs.existsSync(envLocalPath)) {
      let loaded = false;
      if (loadEnvFile(envPath, false)) {
        loaded = true;
      }
      if (loadEnvFile(envLocalPath, true)) {
        loaded = true;
      }
      return loaded;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return false;
}

/**
 * Parse ROI value from various formats
 * Examples: "$27,000-$39,600", "$27000", "27000"
 */
function parseROIValue(roiString) {
  if (!roiString) return null;

  const cleaned = roiString.toString()
    .replace(/[$,]/g, '')  // Remove $ and commas
    .split('-')[0]         // Take first value if range
    .trim();

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Sanitize reflection data to remove PII and identifiable information
 *
 * Removes/redacts:
 * - Salesforce IDs (15/18 character alphanumeric)
 * - Email addresses
 * - Phone numbers
 * - API keys/tokens
 * - IP addresses
 * - File paths with usernames
 * - URLs with org-specific identifiers
 * - Common credential patterns
 */
function sanitizeReflection(data) {
  // Deep clone to avoid mutating original
  const sanitized = JSON.parse(JSON.stringify(data));

  // Patterns for PII detection
  const patterns = {
    // Salesforce 15/18 character IDs
    salesforceId: /\b[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?\b/g,

    // Email addresses
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

    // Phone numbers (various formats)
    phone: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

    // API keys/tokens (common patterns)
    apiKey: /\b(?:key|token|secret|password|passwd|pwd)[\s:=]+['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,

    // Bearer tokens
    bearerToken: /Bearer\s+[a-zA-Z0-9\-._~+\/]+=*/gi,

    // IP addresses (IPv4)
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

    // File paths with usernames
    filePath: /\/(?:home|Users)\/([^\/\s]+)/g,

    // URLs with my-domain, instance-specific URLs
    orgUrl: /https?:\/\/[\w\-]+\.(?:salesforce|lightning\.force|my\.salesforce|visualforce)\.com/g,

    // JWT tokens
    jwt: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,

    // Common names in quotes (simple heuristic)
    quotedName: /"([A-Z][a-z]+\s[A-Z][a-z]+)"/g,

    // === Business Data Patterns (Tier 1) ===

    // Revenue amounts: $1.2M, $500K, $27,000, $1,234,567.89
    revenueAmount: /\$[\d,]+(?:\.\d+)?(?:\s*[KkMmBb](?:illion)?)?/g,

    // Deal/contract names in quotes: "Acme Renewal Q4", "Widget Corp Enterprise Deal"
    dealName: /"[^"]{3,60}(?:\s(?:Renewal|Deal|Contract|Agreement|Order|Proposal|Amendment|Subscription|License|SOW|MSA|Expansion|Upsell))\s*(?:\d{0,4})?"/gi,

    // Company names in common context patterns: "for AcmeCorp", "at Acme Inc", "client Acme"
    companyInContext: /(?:(?:for|at|with|from|client|customer|account|org|organization|company|tenant)\s+)([A-Z][A-Za-z0-9]+(?:\s+(?:Inc|LLC|Corp|Ltd|Co|GmbH|AG|SA|SAS|BV|NV|Pty|PLC|LP|LLP|Group|Holdings|Technologies|Solutions|Systems|Software|Global|International|Consulting|Services|Partners|Digital|Labs|Media|Health|Bio|Pharma|Energy|Financial|Capital|Ventures|Networks|Cloud|Data|Analytics|Platform|AI|Tech)\.?)?)/g,

    // Business domain names (NOT platform domains - see whitelist below)
    businessDomain: /\b[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:com|io|co|org|net|dev|app|ai|cloud|tech|biz|info|us|uk|de|fr|ca|au|nz|in|jp|eu)\b/gi,

    // Specific record counts: "47,000 contacts", "12,500 accounts", "3.2M leads"
    specificRecordCounts: /\b(\d[\d,]*(?:\.\d+)?(?:\s*[KkMmBb])?)\s+(contacts?|accounts?|leads?|opportunities?|deals?|records?|rows?|items?|users?|members?|customers?|subscriptions?|licenses?|quotes?|orders?|cases?|tickets?)\b/gi,

    // Custom label references: labeled "Order Form", renamed to "Widget", called "Custom Thing"
    customLabels: /(?:(?:labeled|renamed|called|named|titled|aliased|displayed as|shows as|appears as|known as|mapped to|configured as)\s+)"([^"]{2,60})"/gi
  };

  // Platform/tool domains that should NOT be redacted
  const PLATFORM_DOMAIN_WHITELIST = new Set([
    'salesforce.com', 'force.com', 'visualforce.com', 'lightning.force.com',
    'hubspot.com', 'hubapi.com', 'hsforms.com', 'hs-analytics.net',
    'supabase.co', 'supabase.com',
    'github.com', 'githubusercontent.com', 'github.io',
    'slack.com', 'slack-edge.com',
    'asana.com',
    'anthropic.com', 'claude.ai',
    'google.com', 'googleapis.com', 'googleusercontent.com',
    'microsoft.com', 'azure.com', 'office.com', 'outlook.com',
    'aws.amazon.com', 'amazonaws.com',
    'npmjs.com', 'npmjs.org',
    'marketo.com', 'mktoresp.com', 'mktossl.com', 'mktoweb.com',
    'stripe.com',
    'monday.com',
    'notion.so',
    'atlassian.com', 'atlassian.net', 'jira.com', 'confluence.com',
    'docker.com', 'docker.io',
    'cloudflare.com',
    'heroku.com',
    'vercel.com', 'vercel.app',
    'netlify.com', 'netlify.app',
    'sentry.io',
    'datadog.com',
    'pagerduty.com',
    'twilio.com', 'sendgrid.net',
    'zapier.com',
    'intercom.io',
    'zendesk.com',
    'freshdesk.com',
    'steelbrick.com',
    'apttus.com',
    'conga.com',
    'docusign.com', 'docusign.net',
    'lucid.app', 'lucidchart.com',
    'mermaid.live',
    'revpal.io', 'gorevpal.com'
  ]);

  // Recursive sanitization function
  function sanitizeValue(value) {
    if (typeof value === 'string') {
      let sanitized = value;

      // Replace Salesforce IDs
      sanitized = sanitized.replace(patterns.salesforceId, '[SFDC_ID]');

      // Replace emails
      sanitized = sanitized.replace(patterns.email, '[EMAIL]');

      // Replace phone numbers
      sanitized = sanitized.replace(patterns.phone, '[PHONE]');

      // Replace API keys/tokens
      sanitized = sanitized.replace(patterns.apiKey, (match, key) => {
        const prefix = match.substring(0, match.indexOf(key));
        return prefix + '[API_KEY]';
      });

      // Replace bearer tokens
      sanitized = sanitized.replace(patterns.bearerToken, 'Bearer [TOKEN]');

      // Replace JWT tokens
      sanitized = sanitized.replace(patterns.jwt, '[JWT_TOKEN]');

      // Replace IP addresses
      sanitized = sanitized.replace(patterns.ipAddress, '[IP_ADDRESS]');

      // Replace file paths with usernames
      sanitized = sanitized.replace(patterns.filePath, '/[USER]');

      // Replace org-specific URLs (keep salesforce.com domain pattern)
      sanitized = sanitized.replace(patterns.orgUrl, 'https://[ORG].salesforce.com');

      // Replace quoted names (people's names)
      sanitized = sanitized.replace(patterns.quotedName, '"[NAME]"');

      // === Business Data Replacements ===

      // Replace revenue amounts
      sanitized = sanitized.replace(patterns.revenueAmount, '[AMOUNT]');

      // Replace deal/contract names
      sanitized = sanitized.replace(patterns.dealName, '"[DEAL_NAME]"');

      // Replace company names in context
      sanitized = sanitized.replace(patterns.companyInContext, (match, companyName) => {
        const prefix = match.substring(0, match.length - companyName.length);
        return prefix + '[COMPANY]';
      });

      // Replace business domains (skip platform domains)
      sanitized = sanitized.replace(patterns.businessDomain, (match) => {
        const domain = match.toLowerCase();
        // Check if domain or its parent is whitelisted
        for (const whitelisted of PLATFORM_DOMAIN_WHITELIST) {
          if (domain === whitelisted || domain.endsWith('.' + whitelisted)) {
            return match; // Keep platform domains
          }
        }
        return '[DOMAIN]';
      });

      // Replace specific record counts
      sanitized = sanitized.replace(patterns.specificRecordCounts, (match, count, objectType) => {
        return `[N] ${objectType}`;
      });

      // Replace custom label references
      sanitized = sanitized.replace(patterns.customLabels, (match, label) => {
        const prefix = match.substring(0, match.indexOf('"'));
        return prefix + '"[CUSTOM_LABEL]"';
      });

      return sanitized;
    } else if (Array.isArray(value)) {
      return value.map(item => sanitizeValue(item));
    } else if (value !== null && typeof value === 'object') {
      const sanitizedObj = {};
      for (const key in value) {
        sanitizedObj[key] = sanitizeValue(value[key]);
      }
      return sanitizedObj;
    }

    return value;
  }

  return sanitizeValue(sanitized);
}

/**
 * Make HTTP/HTTPS request using native Node.js modules
 * (Avoiding external dependencies for portability)
 */
function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            ok: true,
            status: res.statusCode,
            data: data ? JSON.parse(data) : null,
            text: () => Promise.resolve(data)
          });
        } else {
          resolve({
            ok: false,
            status: res.statusCode,
            data: null,
            text: () => Promise.resolve(data)
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Check if reflection already exists in Supabase
 *
 * Queries for reflections matching:
 * - Same summary
 * - Same user_email (if set)
 * - Same org
 * - Within ±5 minutes of the reflection timestamp
 *
 * @param {Object} reflection - The reflection data to check
 * @param {string} supabaseUrl - Supabase project URL
 * @param {string} supabaseKey - Supabase API key
 * @returns {Promise<Object|null>} - Existing reflection if found, null otherwise
 */
async function checkIfAlreadySubmitted(reflection, supabaseUrl, supabaseKey) {
  const summary = reflection.summary;
  const userEmail = process.env.USER_EMAIL || null;
  const org = reflection.org_name || reflection.session_metadata?.org || null;

  if (!summary) {
    return null; // Can't check without summary
  }

  // Extract timestamp from reflection or use current time
  let reflectionTime;
  if (reflection.session_metadata?.session_end) {
    reflectionTime = new Date(reflection.session_metadata.session_end);
  } else if (reflection.metadata?.session_end) {
    reflectionTime = new Date(reflection.metadata.session_end);
  } else {
    reflectionTime = new Date();
  }

  // Build query to check for existing reflections
  // Using PostgREST query syntax with JSONB operators
  const fiveMinutesMs = 5 * 60 * 1000;
  const startTime = new Date(reflectionTime.getTime() - fiveMinutesMs).toISOString();
  const endTime = new Date(reflectionTime.getTime() + fiveMinutesMs).toISOString();

  // Build query parameters
  const queryParams = new URLSearchParams();
  queryParams.append('select', 'id,created_at,org');

  // Filter by summary (using JSONB path operator)
  queryParams.append('data->>summary', `eq.${summary}`);

  // Filter by time window
  queryParams.append('created_at', `gte.${startTime}`);
  queryParams.append('created_at', `lte.${endTime}`);

  // Filter by org if available
  if (org) {
    queryParams.append('org', `eq.${org}`);
  }

  // Filter by user_email if available (handle both set and null cases)
  if (userEmail) {
    queryParams.append('user_email', `eq.${userEmail}`);
  }

  queryParams.append('limit', '1');

  const queryUrl = `${supabaseUrl}/rest/v1/reflections?${queryParams.toString()}`;

  try {
    const response = await makeRequest(
      queryUrl,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json'
        }
      }
    );

    if (response.ok && response.data && response.data.length > 0) {
      return response.data[0]; // Return first matching reflection
    }

    return null; // No match found
  } catch (err) {
    // On error, return null (fail open - allow submission)
    console.warn('⚠️  Could not check for duplicates:', err.message);
    return null;
  }
}

/**
 * Auto-detect plugin name and version from plugin.json
 * Looks in multiple possible locations for opspal-core
 */
function detectPluginInfo() {
  const scriptDir = __dirname; // .../opspal-core/scripts/lib

  // Build list of potential manifest paths
  const searchPaths = [
    path.resolve(scriptDir, '../..', '.claude-plugin', 'plugin.json'),  // Standard: opspal-core
    path.resolve(scriptDir, '../../..', '.claude-plugin', 'plugin.json'), // One level up
    process.env.CLAUDE_PLUGIN_ROOT ? path.join(process.env.CLAUDE_PLUGIN_ROOT, '.claude-plugin', 'plugin.json') : null,
  ].filter(Boolean);

  for (const manifestPath of searchPaths) {
    try {
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (process.env.REFLECT_DEBUG === '1') {
          console.error(`[DEBUG] Found plugin manifest at: ${manifestPath}`);
        }
        return {
          plugin_name: manifest.name || 'opspal-core',
          plugin_version: manifest.version || null
        };
      }
    } catch (err) {
      console.error(`[WARN] Failed to read manifest at ${manifestPath}: ${err.message}`);
    }
  }

  console.error(`[WARN] No plugin manifest found in search paths, using defaults`);
  if (process.env.REFLECT_DEBUG === '1') {
    console.error(`[DEBUG] Searched paths: ${searchPaths.join(', ')}`);
  }

  return {
    plugin_name: 'opspal-core',
    plugin_version: null
  };
}

// Import JSONB wrapper utility (look in dev-tools)
const jsonbWrapperPath = path.resolve(__dirname, '../../dev-tools/developer-tools-plugin/scripts/lib/supabase-jsonb-wrapper.js');
let wrapForSupabase, parseSupabaseError;

try {
  const jsonbWrapper = require(jsonbWrapperPath);
  wrapForSupabase = jsonbWrapper.wrapForSupabase;
  parseSupabaseError = jsonbWrapper.parseSupabaseError;
} catch (err) {
  // Fallback if wrapper not available (backwards compatibility)
  wrapForSupabase = null;
  parseSupabaseError = (err) => err.message || 'Unknown error';
}

// Import data quality enforcer (local to opspal-core)
const dataQualityEnforcerPath = path.resolve(__dirname, 'reflection-data-quality-enforcer.js');
let validateReflection, enforceDataQuality, printValidationResult;

try {
  const enforcer = require(dataQualityEnforcerPath);
  validateReflection = enforcer.validateReflection;
  enforceDataQuality = enforcer.enforceDataQuality;
  printValidationResult = enforcer.printValidationResult;
} catch (err) {
  // Fallback if enforcer not available
  console.warn('⚠️  Data quality enforcer not found, skipping validation');
  validateReflection = () => ({ valid: true, qualityScore: 0, errors: [], missing: [], warnings: [] });
  enforceDataQuality = (data) => data;
  printValidationResult = () => {};
}

// Import taxonomy classifier (local to opspal-core)
const taxonomyClassifierPath = path.resolve(__dirname, 'taxonomy-classifier.js');
let TaxonomyClassifier;

try {
  ({ TaxonomyClassifier } = require(taxonomyClassifierPath));
} catch (err) {
  console.warn('⚠️  Taxonomy classifier not found, skipping taxonomy auto-fill');
  TaxonomyClassifier = null;
}

// Import SessionCollector for auto-captured context (local to opspal-core)
const sessionCollectorPath = path.resolve(__dirname, 'session-collector.js');
let SessionCollector;

try {
  SessionCollector = require(sessionCollectorPath);
} catch (err) {
  console.warn('⚠️  SessionCollector not found, skipping session context auto-capture');
  SessionCollector = null;
}

// Import FixVerificationDetector for closed-loop verification (local to opspal-core)
const fixVerificationPath = path.resolve(__dirname, 'fix-verification-detector.js');
let FixVerificationDetector;

try {
  FixVerificationDetector = require(fixVerificationPath);
} catch (err) {
  // Silent - verification is optional
  FixVerificationDetector = null;
}

const TAXONOMY_NORMALIZATION = new Map([
  ['tool-contract mismatch', 'tool-contract'],
  ['tool-contract-mismatch', 'tool-contract'],
  ['tool contract mismatch', 'tool-contract'],
  ['toolcontractmismatch', 'tool-contract'],
  ['prompt/llm mismatch', 'prompt-mismatch'],
  ['prompt/llm-mismatch', 'prompt-mismatch'],
  ['prompt/llm', 'prompt-mismatch'],
  ['prompt llm mismatch', 'prompt-mismatch'],
  ['promptllmmismatch', 'prompt-mismatch'],
  ['schema-parse', 'schema/parse'],
  ['schema parse', 'schema/parse'],
  ['schemaparse', 'schema/parse'],
  ['data quality', 'data-quality'],
  ['idempotency-state', 'idempotency/state'],
  ['idempotency state', 'idempotency/state'],
  ['idempotencystate', 'idempotency/state'],
  ['external-api drift', 'external-api']
]);

const PRIORITY_NORMALIZATION = new Map([
  ['p0', 'P0'],
  ['p1', 'P1'],
  ['p2', 'P2'],
  ['p3', 'P3'],
  ['0', 'P0'],
  ['1', 'P1'],
  ['2', 'P2'],
  ['3', 'P3'],
  ['critical', 'P0'],
  ['high', 'P1'],
  ['medium', 'P2'],
  ['low', 'P3']
]);

function getValueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function taxonomyLookupKey(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s*\/\s*/g, '/')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-');
}

function taxonomyLooseKey(value) {
  return taxonomyLookupKey(value).replace(/[^a-z0-9]/g, '');
}

function normalizeTaxonomy(taxonomy) {
  if (!taxonomy || typeof taxonomy !== 'string') return null;
  const trimmed = taxonomy.trim();
  if (!trimmed) return null;

  const exactKey = taxonomyLookupKey(trimmed);
  if (TAXONOMY_NORMALIZATION.has(exactKey)) {
    return TAXONOMY_NORMALIZATION.get(exactKey);
  }

  const looseKey = taxonomyLooseKey(trimmed);
  if (TAXONOMY_NORMALIZATION.has(looseKey)) {
    return TAXONOMY_NORMALIZATION.get(looseKey);
  }

  return trimmed;
}

function normalizePriority(priority) {
  if (priority === null || priority === undefined) return null;
  const normalized = PRIORITY_NORMALIZATION.get(String(priority).trim().toLowerCase());
  return normalized || null;
}

function normalizeIssueCollection(reflection, strictMode = false) {
  const actions = [];
  const candidates = [
    { key: 'issues_identified', value: reflection.issues_identified },
    { key: 'issues', value: reflection.issues }
  ];

  let selectedIssues = null;
  let selectedKey = null;

  for (const candidate of candidates) {
    if (Array.isArray(candidate.value)) {
      selectedIssues = candidate.value;
      selectedKey = candidate.key;
      break;
    }
  }

  if (!selectedIssues) {
    const malformed = candidates.find(c => c.value !== undefined && c.value !== null);
    if (malformed) {
      const valueType = getValueType(malformed.value);
      const error = `issues/issues_identified must be arrays; received ${malformed.key}=${valueType}`;
      if (strictMode) {
        return { ok: false, error, actions, issues: [] };
      }
      actions.push(`coerced ${malformed.key} (${valueType}) to []`);
      selectedIssues = [];
      selectedKey = malformed.key;
    } else {
      actions.push('initialized missing issues payload to []');
      selectedIssues = [];
      selectedKey = 'default';
    }
  }

  const normalizedIssues = [];
  let droppedEntries = 0;
  for (const issue of selectedIssues) {
    if (issue && typeof issue === 'object' && !Array.isArray(issue)) {
      normalizedIssues.push(issue);
    } else {
      droppedEntries++;
    }
  }

  if (droppedEntries > 0) {
    const error = `issues array contains ${droppedEntries} non-object entries`;
    if (strictMode) {
      return { ok: false, error, actions, issues: [] };
    }
    actions.push(`dropped ${droppedEntries} non-object issue entries`);
  }

  reflection.issues_identified = normalizedIssues;
  reflection.issues = normalizedIssues;

  return {
    ok: true,
    issues: normalizedIssues,
    source: selectedKey,
    actions
  };
}

function buildTaxonomyText(issue, summary) {
  const parts = [
    issue.title,
    issue.description,
    issue.root_cause,
    issue.agnostic_fix,
    issue.minimal_patch,
    issue.reproducible_trigger,
    summary
  ].filter(Boolean);
  return parts.join(' ');
}

function applyTaxonomyImprovements(issues, summary) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return { normalizedCount: 0, classifiedCount: 0, priorityNormalizedCount: 0 };
  }

  const classifier = TaxonomyClassifier ? new TaxonomyClassifier() : null;
  let normalizedCount = 0;
  let classifiedCount = 0;
  let priorityNormalizedCount = 0;

  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') continue;

    const normalizedPriority = normalizePriority(issue.priority);
    if (normalizedPriority && issue.priority !== normalizedPriority) {
      issue.priority = normalizedPriority;
      priorityNormalizedCount++;
    }

    const normalized = normalizeTaxonomy(issue.taxonomy);
    if (normalized && normalized !== issue.taxonomy) {
      issue.taxonomy = normalized;
      normalizedCount++;
    }

    if ((!issue.taxonomy || issue.taxonomy === 'unknown') && classifier) {
      const text = buildTaxonomyText(issue, summary);
      if (!text) continue;

      const suggestion = classifier.suggestCategory(text);
      const top = suggestion.topSuggestion;
      if (top && top.category && top.category !== 'unknown' && top.confidence >= 0.55) {
        issue.taxonomy = top.category;
        classifiedCount++;
      }
    }
  }

  return { normalizedCount, classifiedCount, priorityNormalizedCount };
}

/**
 * Load Slack webhook URL from environment or .env files
 * @returns {string|null} Webhook URL or null if not configured
 */
function loadSlackWebhookUrl() {
  // Check environment first
  if (process.env.SLACK_WEBHOOK_URL) {
    return process.env.SLACK_WEBHOOK_URL;
  }

  // Try loading from .env files
  const envPaths = [
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../../../.env'),
    path.join(process.env.HOME || '', '.claude/.env'),
    path.join(process.env.HOME || '', '.env')
  ];

  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/SLACK_WEBHOOK_URL=["']?([^\s"']+)["']?/);
        if (match) return match[1].trim();
      }
    } catch (e) {
      // Continue to next file
    }
  }

  return null;
}

/**
 * Send P0 issue alert to Slack
 * @param {Object} options - Alert options
 * @param {string} options.summary - Reflection summary
 * @param {Array} options.p0Issues - P0 priority issues
 * @param {string} options.org - Organization name
 * @param {Array} options.traceIds - Trace IDs for debugging
 * @param {string} options.sessionEnd - Session end timestamp
 * @returns {Promise<boolean>} Success status
 */
async function sendP0Alert(options) {
  const webhookUrl = loadSlackWebhookUrl();

  if (!webhookUrl) {
    // Silent return - Slack not configured
    return false;
  }

  const { summary: rawSummary, p0Issues: rawP0Issues, org, traceIds, sessionEnd } = options;

  // Sanitize free-text fields before sending to Slack (Tier 1 - keep org for internal Slack)
  const sanitizedSummary = sanitizeReflection({ text: rawSummary }).text;
  const sanitizedP0Issues = rawP0Issues.map(issue => sanitizeReflection(issue));

  // Build Slack message
  const issueList = sanitizedP0Issues.slice(0, 3).map(issue => {
    const taxonomy = issue.taxonomy || 'unknown';
    const rootCause = issue.root_cause || issue.description || 'Unknown';
    return `• *${taxonomy}*: ${rootCause.substring(0, 100)}${rootCause.length > 100 ? '...' : ''}`;
  }).join('\n');

  const traceInfo = traceIds && traceIds.length > 0
    ? `Trace ID: \`${traceIds[0].substring(0, 16)}\``
    : 'No trace ID available';

  const message = {
    attachments: [
      {
        color: '#dc3545', // Red for P0
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 P0 Issue Detected in Reflection',
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Session:*\n${sessionEnd || new Date().toISOString()}`
              },
              {
                type: 'mrkdwn',
                text: `*Org:*\n${org || 'unknown'}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Summary:*\n${sanitizedSummary.substring(0, 200)}${sanitizedSummary.length > 200 ? '...' : ''}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*P0 Issues (${sanitizedP0Issues.length}):*\n${issueList}`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `${traceInfo} | Review in Supabase for full details`
              }
            ]
          }
        ]
      }
    ]
  };

  try {
    const url = new URL(webhookUrl);

    return new Promise((resolve) => {
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.write(JSON.stringify(message));
      req.end();
    });
  } catch (error) {
    return false;
  }
}

/**
 * Main submission function
 */
async function submitReflection(reflectionPath) {
  loadEnvFromProjectRoot(process.cwd());

  // Read Supabase configuration from environment variables
  // Prefer SERVICE_ROLE_KEY (bypasses RLS) over ANON_KEY (may fail due to RLS)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  // Detect which key type we're using
  const usingServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const usingAnonKey = !usingServiceKey && !!process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase configuration');
    console.error('');
    console.error('   Required environment variables:');
    console.error('   - SUPABASE_URL (your Supabase project URL)');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY (recommended - bypasses RLS)');
    console.error('     OR SUPABASE_ANON_KEY (may fail due to RLS policies)');
    console.error('');
    console.error('   Example:');
    console.error('   export SUPABASE_URL="https://your-project.supabase.co"');
    console.error('   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."');
    console.error('');
    console.error('   Note: Service role key is in Supabase Dashboard > Settings > API');
    process.exit(1);
  }

  // Warn if using anon key (may fail due to RLS)
  if (usingAnonKey) {
    console.warn('⚠️  Using SUPABASE_ANON_KEY');
    console.warn('   Anon key may fail due to Row Level Security (RLS) policies.');
    console.warn('   Recommended: Set SUPABASE_SERVICE_ROLE_KEY for reliable writes.');
    console.warn('');
  }

  // For backwards compatibility, also expose as supabaseAnonKey variable name
  const supabaseAnonKey = supabaseKey;

  // Auto-detect plugin name and version
  const pluginInfo = detectPluginInfo();

  // Read and parse reflection file
  let reflection;
  try {
    const content = fs.readFileSync(reflectionPath, 'utf-8');
    reflection = JSON.parse(content);
  } catch (err) {
    console.error('❌ Failed to read reflection file:', err.message);
    console.error('   File:', reflectionPath);
    process.exit(1);
  }

  // Debug mode (set REFLECT_DEBUG=1 for verbose output)
  const DEBUG = process.env.REFLECT_DEBUG === '1';

  if (DEBUG) {
    console.log('🐛 DEBUG MODE ENABLED');
    console.log('   Raw reflection keys:', Object.keys(reflection).join(', '));
    console.log('   Supabase URL:', supabaseUrl);
    console.log('   Key type:', usingServiceKey ? 'SERVICE_ROLE_KEY' : 'ANON_KEY');
    console.log('   API Key (first 20 chars):', supabaseKey.substring(0, 20) + '...');
    console.log('   User Email:', process.env.USER_EMAIL || '(anonymous)');
  }

  // Check if strict enforcement is enabled
  const strictMode = process.env.ENFORCE_DATA_QUALITY === '1';

  // Normalize issues payload early so validation and downstream logic always operate on arrays.
  const payloadRepairs = [];
  const initialIssueNormalization = normalizeIssueCollection(reflection, strictMode);
  if (!initialIssueNormalization.ok) {
    console.error('❌ Validation error:', initialIssueNormalization.error);
    console.error('');
    console.error('💡 Fix: Ensure reflection JSON uses array format for issues');
    console.error('   - issues_identified: []');
    console.error('   - issues_identified: [{...}]');
    process.exit(1);
  }
  payloadRepairs.push(...initialIssueNormalization.actions);
  if (initialIssueNormalization.actions.length > 0) {
    console.warn(`⚠️  Issue payload repairs: ${initialIssueNormalization.actions.join('; ')}`);
  }

  // Data quality validation (Phase 1 Critical Gap Closure)
  console.log('📊 Validating data quality...');
  const qualityResult = validateReflection(reflection);

  if (DEBUG || qualityResult.qualityScore < 50) {
    printValidationResult(qualityResult);
  }

  if (!qualityResult.valid && strictMode) {
    console.error('❌ Data quality validation failed (strict mode enabled)');
    console.error('   Set ENFORCE_DATA_QUALITY=0 to submit with warnings');
    process.exit(1);
  }

  // Apply data quality defaults
  if (qualityResult.missing.length > 0 || qualityResult.warnings.length > 0) {
    console.log('🔧 Applying data quality defaults...');
    reflection = enforceDataQuality(reflection);
    console.log(`   Quality score improved: ${qualityResult.qualityScore}% → ${reflection._data_quality?.quality_score || qualityResult.qualityScore}%`);
  } else {
    console.log(`✅ Data quality score: ${qualityResult.qualityScore}%`);
  }

  // Test connection before submission (use reflections table for health check)
  console.log('🔌 Testing Supabase connection...');
  try {
    const healthCheck = await makeRequest(
      `${supabaseUrl}/rest/v1/reflections?limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      }
    );

    if (!healthCheck.ok) {
      const errorText = await healthCheck.text();
      console.error('❌ Connection test failed');
      console.error('   Status:', healthCheck.status);
      console.error('   Response:', errorText.substring(0, 200));
      console.error('');
      console.error('💡 Troubleshooting:');
      console.error('   1. Verify SUPABASE_URL is correct');
      console.error('   2. Check that SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is valid');
      console.error('   3. Ensure reflections table exists in Supabase');
      console.error('   4. Test manually: curl -X GET "$SUPABASE_URL/rest/v1/reflections?limit=1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"');
      process.exit(1);
    }
    console.log('✅ Connection successful');
  } catch (err) {
    console.error('❌ Network error:', err.message);
    console.error('   Cannot reach Supabase - check your internet connection');
    console.error('');
    console.error('💡 Reflection saved locally at:', reflectionPath);
    console.error('   You can submit manually when network is restored');
    process.exit(1);
  }

  // Check if reflection already exists in Supabase
  console.log('🔍 Checking for duplicate submission...');
  const existingReflection = await checkIfAlreadySubmitted(reflection, supabaseUrl, supabaseAnonKey);

  if (existingReflection) {
    console.log('⏭️  Reflection already submitted');
    console.log(`   Database ID: ${existingReflection.id}`);
    console.log(`   Submitted: ${new Date(existingReflection.created_at).toLocaleString()}`);
    console.log(`   Org: ${existingReflection.org || 'unknown'}`);
    console.log('');
    console.log('✅ No action needed - reflection is already in the database');
    console.log('');
    console.log('📊 View in Supabase:');
    console.log(`   ${supabaseUrl.replace('/rest/v1', '')}/project/default/editor`);
    process.exit(0); // Exit successfully - this is not an error
  }

  console.log('✅ No duplicate found - proceeding with submission');

  // Validate required fields BEFORE sanitization
  const hasSummary = reflection.summary;

  // Critical validation: summary is always required
  if (!hasSummary) {
    console.error('❌ Validation error: Missing required field: summary');
    console.error('Provided:', Object.keys(reflection).join(', '));
    console.error('');
    console.error('💡 Fix: Ensure your reflection JSON includes:');
    console.error('   - summary: "Brief description of session"');
    console.error('   - issues: [array of issues] or issues_identified: [array of issues]');
    console.error('');
    console.error('Note: Issues array can be empty for error-free sessions');
    process.exit(1);
  }

  if (reflection.issues_identified.length === 0) {
    console.log('ℹ️  Note: Issues array is empty (error-free session)');
  }

  // Sanitize reflection data to remove PII and identifiable information
  console.log('🔒 Sanitizing reflection data...');
  reflection = sanitizeReflection(reflection);

  // Ensure sanitize pass did not alter issue payload shape.
  const sanitizedIssueNormalization = normalizeIssueCollection(reflection, false);
  if (!sanitizedIssueNormalization.ok) {
    console.error('❌ Unable to normalize issues after sanitization:', sanitizedIssueNormalization.error);
    process.exit(1);
  }
  if (sanitizedIssueNormalization.actions.length > 0) {
    payloadRepairs.push(...sanitizedIssueNormalization.actions);
  }

  // Extract session metadata
  const metadata = reflection.session_metadata || {};
  const issues = sanitizedIssueNormalization.issues;

  const taxonomyStats = applyTaxonomyImprovements(issues, reflection.summary);
  if (
    taxonomyStats.normalizedCount ||
    taxonomyStats.classifiedCount ||
    taxonomyStats.priorityNormalizedCount
  ) {
    console.log(
      `🧭 Taxonomy cleanup: normalized ${taxonomyStats.normalizedCount}, auto-classified ${taxonomyStats.classifiedCount}, priority-normalized ${taxonomyStats.priorityNormalizedCount}`
    );
  }

  // Extract priority issues (P0 and P1 only)
  const priorityIssues = issues.filter(issue => {
    const priority = issue.priority || '';
    return priority === 'P0' || priority === 'P1';
  });

  // Auto-detect org from multiple sources
  let org = metadata.org ||
            reflection.org_name ||
            reflection.org ||
            process.env.ORG_NAME ||
            process.env.SALESFORCE_ORG_ALIAS ||
            process.env.SF_TARGET_ORG ||
            null;

  // If still not found, try to extract from current directory
  if (!org) {
    try {
      const cwd = process.cwd();
      // Try to extract org from common patterns:
      // /path/to/instances/salesforce/eta-corp/ -> "eta-corp"
      // /path/to/instances/eta-corp/ -> "eta-corp"
      // /path/to/eta-corp-project/ -> "eta-corp"
      // /path/to/projects/eta-corp-assessment/ -> "eta-corp"
      const matches = cwd.match(/\/instances\/(?:salesforce|hubspot)\/([^\/]+)/) ||
                     cwd.match(/\/instances\/([^\/]+)/) ||
                     cwd.match(/\/projects\/([^\/]+?)(?:-assessment|-project)?(?:\/|$)/) ||
                     cwd.match(/\/([^\/]+)-(?:project|assessment)(?:\/|$)/) ||
                     cwd.match(/\/([^\/]+)$/);
      if (matches && matches[1] &&
          !['lib', 'scripts', 'agents', 'hooks', 'config', 'docs', 'templates', '.claude', '.claude-plugins'].includes(matches[1])) {
        org = matches[1];
        console.log(`   Auto-detected org: ${org}`);
      }
    } catch (err) {
      // Ignore errors in org detection
    }
  }

  // If org found, log it
  if (org && !metadata.org) {
    console.log(`   Org: ${org}`);
  }

  // Auto-detect focus area from multiple sources
  let focusArea = metadata.focus_area ||
                 reflection.focus_area ||
                 reflection.assessment_type ||
                 null;

  if (!focusArea && issues.length > 0) {
    // Use most common taxonomy as focus area
    const taxonomies = issues.map(i => i.taxonomy).filter(Boolean);
    if (taxonomies.length > 0) {
      const counts = {};
      taxonomies.forEach(t => counts[t] = (counts[t] || 0) + 1);
      focusArea = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
      console.log(`   Focus area: ${focusArea} (from ${taxonomies.length} issues)`);
    }
  }

  // If still no focus area, try to infer from summary
  if (!focusArea && reflection.summary) {
    const summaryLower = reflection.summary.toLowerCase();
    if (summaryLower.includes('cpq') || summaryLower.includes('quote')) {
      focusArea = 'cpq-assessment';
    } else if (summaryLower.includes('revops') || summaryLower.includes('pipeline') || summaryLower.includes('forecast')) {
      focusArea = 'revops-audit';
    } else if (summaryLower.includes('automation') || summaryLower.includes('flow')) {
      focusArea = 'automation-audit';
    } else if (summaryLower.includes('permission') || summaryLower.includes('security')) {
      focusArea = 'security-audit';
    } else if (summaryLower.includes('deployment') || summaryLower.includes('deploy')) {
      focusArea = 'deployment';
    } else if (summaryLower.includes('report') || summaryLower.includes('dashboard')) {
      focusArea = 'reports-dashboards';
    }

    if (focusArea) {
      console.log(`   Focus area: ${focusArea} (inferred from summary)`);
    }
  }

  // Calculate ROI from issues if not provided
  let roiValue = parseROIValue(reflection.roi_annual_value);
  if (roiValue === null && reflection.roi_analysis?.total_annual_roi) {
    roiValue = parseROIValue(reflection.roi_analysis.total_annual_roi);
  }
  if (roiValue === null && reflection.roi_analysis?.time_savings?.annual_value) {
    roiValue = parseROIValue(reflection.roi_analysis.time_savings.annual_value);
  }
  if (roiValue === null) {
    // Try to calculate from individual issues
    const issueROIs = issues
      .map(i => i.roi_annual_value || i.estimated_roi_annual)
      .filter(Boolean)
      .map(r => parseROIValue(r))
      .filter(r => r !== null);

    if (issueROIs.length > 0) {
      roiValue = issueROIs.reduce((sum, val) => sum + val, 0);
      console.log(`   Calculated ROI from ${issueROIs.length} issues: $${roiValue.toLocaleString()}`);
    }
  }
  if (roiValue !== null) {
    reflection.roi_annual_value = roiValue;
  }

  // Estimate duration if not provided - check multiple sources
  let durationMinutes = metadata.duration_minutes ||
                       reflection.duration_minutes ||
                       null;

  if (!durationMinutes) {
    // Try to calculate from session timestamps in various locations
    const sessionStart = reflection.session_start ||
                        metadata.session_start ||
                        metadata.start_time ||
                        reflection.metadata?.session_start;
    const sessionEnd = reflection.session_end ||
                      metadata.session_end ||
                      metadata.end_time ||
                      reflection.metadata?.session_end;

    if (sessionStart && sessionEnd) {
      try {
        const start = new Date(sessionStart);
        const end = new Date(sessionEnd);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          durationMinutes = Math.round((end - start) / 60000);
          if (durationMinutes > 0 && durationMinutes < 1440) { // Sanity check: 0-24 hours
            console.log(`   Duration: ${durationMinutes} minutes (calculated)`);
          } else {
            durationMinutes = null; // Invalid duration
          }
        }
      } catch (err) {
        // Ignore date parsing errors
      }
    }
  }

  // Extract diagnostic context if present (from plugin-doctor)
  const diagnosticContext = reflection.diagnostic_context || null;
  const infrastructureIssue = reflection.infrastructure_issue || false;

  // Load auto-captured session context
  let sessionContext = null;
  let durationSource = 'user_provided';
  let agentsUsed = [];

  if (SessionCollector) {
    try {
      const collector = await SessionCollector.getCurrent();
      const summary = collector.generateSessionSummary();

      if (summary && summary.event_count > 0) {
        sessionContext = summary;

        // Use auto-captured duration if we don't have one yet
        if (!durationMinutes && summary.duration_minutes > 0) {
          durationMinutes = summary.duration_minutes;
          durationSource = 'auto_captured';
          console.log(`   Duration: ${durationMinutes} minutes (auto-captured)`);
        } else if (durationMinutes) {
          durationSource = 'user_provided';
        }

        // Extract agents used
        if (summary.agents_invoked && summary.agents_invoked.length > 0) {
          agentsUsed = summary.agents_invoked.map(a => a.agent);
          console.log(`   Agents used: ${agentsUsed.length} (${agentsUsed.slice(0, 3).join(', ')}${agentsUsed.length > 3 ? '...' : ''})`);
        }

        // Log session context summary
        console.log(`   Session context: ${summary.files_edited_count || 0} files, ${summary.tools_invoked_count || 0} tool calls, ${summary.errors_captured_count || 0} errors`);
      }

      await collector.close();
    } catch (err) {
      // Silent failure - session context is optional enrichment
      if (DEBUG) {
        console.log('🐛 Session context load failed:', err.message);
      }
    }
  }

  // Determine ROI confidence based on data quality
  let roiConfidence = 'estimated';
  if (roiValue) {
    // High confidence if we have actual calculations from query results
    const hasQueryBasedROI = reflection.roi_analysis?.calculation_method === 'query_based' ||
                             reflection.roi_analysis?.sources?.length > 0;
    const hasDetailedBreakdown = reflection.roi_analysis?.time_savings?.hours_per_month !== undefined ||
                                 reflection.roi_analysis?.error_prevention?.errors_prevented !== undefined;

    if (hasQueryBasedROI && hasDetailedBreakdown) {
      roiConfidence = 'high';
    } else if (hasQueryBasedROI || hasDetailedBreakdown) {
      roiConfidence = 'medium';
    } else {
      roiConfidence = 'low';
    }
  }

  if (reflection._data_quality?.flags?.high_priority_without_explicit_roi) {
    console.log('⚠️  ROI inferred for high-priority issues (explicit ROI was missing/zero)');
  }

  // Log infrastructure issue detection
  if (infrastructureIssue && diagnosticContext) {
    console.log('🚨 Infrastructure issue detected - including diagnostic context');
    if (diagnosticContext.severity) {
      console.log(`   Severity: ${diagnosticContext.severity}`);
    }
    if (diagnosticContext.plugin_health) {
      const pluginIssues = Object.values(diagnosticContext.plugin_health).filter(p => p.status !== 'OK').length;
      if (pluginIssues > 0) {
        console.log(`   Plugin issues: ${pluginIssues}`);
      }
    }
    if (diagnosticContext.mcp_status) {
      const mcpIssues = Object.values(diagnosticContext.mcp_status).filter(s => s.status !== 'connected').length;
      if (mcpIssues > 0) {
        console.log(`   MCP issues: ${mcpIssues}`);
      }
    }
  }

  // Ensure canonical issues payload shape before database insert.
  reflection.issues_identified = issues;
  reflection.issues = issues;
  reflection.total_issues = issues.length;
  if (roiValue !== null) {
    reflection.roi_annual_value = roiValue;
  }

  // Build reflection data payload (what goes in the JSONB 'data' column)
  const reflectionData = {
    ...reflection,
    plugin_name: pluginInfo.plugin_name,
    plugin_version: pluginInfo.plugin_version,
    total_issues: issues.length,
    priority_issues: priorityIssues,
    roi_annual_value: roiValue
  };

  // Use JSONB wrapper if available, otherwise use legacy format
  let payload;
  if (wrapForSupabase) {
    try {
      payload = wrapForSupabase('reflections', reflectionData, {
        userEmail: process.env.USER_EMAIL,
        org: org,
        validate: true  // Validate against schema
      });

      // Add additional fields not in JSONB wrapper
      payload.focus_area = focusArea;
      payload.outcome = metadata.outcome || null;
      payload.duration_minutes = durationMinutes;
      payload.total_issues = issues.length;
      payload.roi_annual_value = roiValue;

      // Add diagnostic fields (plugin-doctor integration)
      if (diagnosticContext) {
        payload.diagnostic_context = diagnosticContext;
      }
      if (infrastructureIssue) {
        payload.infrastructure_issue = infrastructureIssue;
      }

      // Add session context fields (reflection system improvement)
      if (sessionContext) {
        payload.session_context = sessionContext;
        payload.files_edited_count = sessionContext.files_edited_count || 0;
        payload.tools_invoked_count = sessionContext.tools_invoked_count || 0;
        payload.errors_captured_count = sessionContext.errors_captured_count || 0;
      }
      if (agentsUsed.length > 0) {
        payload.agents_used = agentsUsed;
      }
      payload.duration_source = durationSource;
      payload.roi_confidence = roiConfidence;

      console.log('✅ Payload validated with JSONB wrapper');
    } catch (err) {
      console.error('❌ Validation error:', err.message);
      process.exit(1);
    }
  } else {
    // Legacy format (backwards compatibility)
    payload = {
      user_email: process.env.USER_EMAIL || null,
      org: org,
      focus_area: focusArea,
      outcome: metadata.outcome || null,
      duration_minutes: durationMinutes,
      plugin_name: pluginInfo.plugin_name,
      plugin_version: pluginInfo.plugin_version,
      data: reflection,
      total_issues: issues.length,
      priority_issues: priorityIssues,
      roi_annual_value: roiValue
    };

    // Add diagnostic fields (plugin-doctor integration)
    if (diagnosticContext) {
      payload.diagnostic_context = diagnosticContext;
    }
    if (infrastructureIssue) {
      payload.infrastructure_issue = infrastructureIssue;
    }

    // Add session context fields (reflection system improvement)
    if (sessionContext) {
      payload.session_context = sessionContext;
      payload.files_edited_count = sessionContext.files_edited_count || 0;
      payload.tools_invoked_count = sessionContext.tools_invoked_count || 0;
      payload.errors_captured_count = sessionContext.errors_captured_count || 0;
    }
    if (agentsUsed.length > 0) {
      payload.agents_used = agentsUsed;
    }
    payload.duration_source = durationSource;
    payload.roi_confidence = roiConfidence;
  }

  // Validate payload
  if (!payload.data) {
    console.error('❌ Invalid reflection format: missing data');
    process.exit(1);
  }

  // Debug output before submission
  if (DEBUG) {
    console.log('🐛 Payload structure:');
    console.log('   Keys:', Object.keys(payload).join(', '));
    console.log('   Data keys:', Object.keys(payload.data || {}).join(', '));
    console.log('   Issues count:', payload.total_issues);
  }

  // Submit to Supabase
  console.log('📤 Submitting reflection to database...');
  console.log(`   Plugin: ${payload.plugin_name || 'unknown'} v${payload.plugin_version || 'unknown'}`);
  console.log(`   Org: ${payload.org || 'unknown'}`);
  console.log(`   Focus: ${payload.focus_area || 'general'}`);
  console.log(`   Issues: ${payload.total_issues} total, ${priorityIssues.length} high-priority`);
  if (payloadRepairs.length > 0) {
    console.log(`   Payload repairs: ${payloadRepairs.join('; ')}`);
  }
  if (roiValue) {
    console.log(`   ROI: $${roiValue.toLocaleString()}/year`);
  }
  if (reflection._data_quality?.flags?.high_priority_without_explicit_roi) {
    console.log('   ROI source: inferred fallback (high-priority issues)');
  }
  console.log('');

  try {
    const response = await makeRequest(
      `${supabaseUrl}/rest/v1/reflections`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'  // Don't return inserted row (faster)
        }
      },
      JSON.stringify(payload)
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Supabase API error:', response.status);

      // Parse error with JSONB wrapper if available
      if (parseSupabaseError) {
        try {
          const parsedError = parseSupabaseError(JSON.parse(errorText));
          console.error('   ', parsedError);
        } catch {
          console.error('   Response:', errorText);
        }
      } else {
        console.error('   Response:', errorText);
      }

      // Provide helpful error messages
      if (response.status === 401 || response.status === 403) {
        console.error('');
        console.error('   This may be a permissions issue:');
        console.error('   - Check that SUPABASE_SERVICE_ROLE_KEY is correct');
        console.error('   - If using SUPABASE_ANON_KEY, Row Level Security may be blocking writes');
        console.error('   - Recommended: Use SUPABASE_SERVICE_ROLE_KEY for reliable submissions');
      } else if (response.status === 400) {
        console.error('');
        console.error('   This may be a schema mismatch:');
        console.error('   - Run scripts/supabase-schema.sql in Supabase SQL Editor');
        console.error('   - Check that the reflections table exists');
        console.error('   - Verify payload structure matches schema');
      }

      process.exit(1);
    }

    // Success!
    console.log('✅ Reflection submitted successfully');

    // Check for P0 issues and send Slack alert
    const p0Issues = issues.filter(issue => issue.priority === 'P0');
    if (p0Issues.length > 0) {
      console.log('');
      console.log(`🚨 ${p0Issues.length} P0 issue(s) detected - sending alert...`);

      // Extract debugging context if available
      let debuggingTraceIds = [];
      if (reflection.debugging_context?.trace_ids) {
        debuggingTraceIds = reflection.debugging_context.trace_ids;
      }

      const alertSent = await sendP0Alert({
        summary: reflection.summary || '',
        p0Issues,
        org: payload.org,
        traceIds: debuggingTraceIds,
        sessionEnd: metadata.session_end
      });

      if (alertSent) {
        console.log('   Slack alert sent');
      } else {
        console.log('   Slack not configured or alert failed (non-blocking)');
      }
    }

    // Check for fix verification (closed-loop learning)
    if (FixVerificationDetector) {
      try {
        const detector = new FixVerificationDetector({ verbose: false });

        // Build reflection object for verification check
        const reflectionForVerification = {
          id: response.data?.[0]?.id || 'pending',
          org: payload.org,
          summary: reflection.summary,
          taxonomy_category: issues[0]?.taxonomy || null,
          prevention_category: issues[0]?.prevention_category || null,
          outcome: metadata.outcome || 'success',
          issues: issues
        };

        const verificationResult = await detector.checkForRelatedFixes(reflectionForVerification);

        if (verificationResult && verificationResult.length > 0) {
          const bestMatch = verificationResult[0];
          console.log('');
          console.log('🔄 Closed-loop verification detected:');
          console.log(`   This reflection may verify fix: "${bestMatch.fix_title}"`);
          console.log(`   Match score: ${Math.round(bestMatch.match_score * 100)}%`);
          console.log(`   Reasons: ${bestMatch.match_reasons.join(', ')}`);
        }
      } catch (err) {
        // Silent failure - verification is optional
      }
    }

    console.log('');
    console.log('📊 View in Supabase:');
    console.log(`   ${supabaseUrl.replace('/rest/v1', '')}/project/default/editor`);
    console.log('');
    console.log('📈 Query your reflections:');
    console.log('   node .claude-plugins/opspal-core/scripts/lib/query-reflections.js recent');
    console.log('   node .claude-plugins/opspal-core/scripts/lib/query-reflections.js topIssues');

  } catch (error) {
    console.error('❌ Network error:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  - Check your internet connection');
    console.error('  - Verify SUPABASE_URL is correct');
    console.error('  - Try accessing', supabaseUrl, 'in your browser');
    process.exit(1);
  }
}

// =============================================================================
// Tier 2: External Output Sanitization
// =============================================================================

/**
 * Sanitize data for external outputs (Asana tasks, Slack alerts, improvement plans).
 *
 * Two-tier model:
 *   Tier 1 (sanitizeReflection): Redacts technical PII + business data. Used for Supabase storage.
 *   Tier 2 (this function): Additionally anonymizes org slugs and affected_orgs with opaque IDs.
 *
 * @param {Object|Array} data - Data to sanitize (cohort, fix plan, or array of either)
 * @returns {Object|Array} Sanitized copy with org references anonymized
 */
function sanitizeForExternalOutput(data) {
  // Step 1: Apply Tier 1 sanitization
  const sanitized = sanitizeReflection(data);

  // Step 2: Build consistent org → opaque-ID mapping for this processing run
  const orgMap = new Map();
  let orgCounter = 0;

  function getOpaqueOrg(orgSlug) {
    if (!orgSlug || orgSlug === 'unknown' || orgSlug === 'internal') return orgSlug;
    if (!orgMap.has(orgSlug)) {
      orgCounter++;
      orgMap.set(orgSlug, `org-${String.fromCharCode(64 + orgCounter)}`); // org-A, org-B, etc.
    }
    return orgMap.get(orgSlug);
  }

  // Step 3: Recursively anonymize org references in the data
  function anonymizeOrgs(value) {
    if (typeof value === 'string') {
      // Replace any org slug references found in free text
      let result = value;
      for (const [slug, opaque] of orgMap.entries()) {
        // Replace whole-word occurrences of the slug
        const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp('\\b' + escaped + '\\b', 'gi'), opaque);
      }
      return result;
    } else if (Array.isArray(value)) {
      return value.map(item => anonymizeOrgs(item));
    } else if (value !== null && typeof value === 'object') {
      const result = {};
      for (const key in value) {
        if (key === 'org' || key === 'org_slug') {
          // First pass: build the mapping
          result[key] = getOpaqueOrg(value[key]);
        } else if (key === 'affected_orgs' && Array.isArray(value[key])) {
          result[key] = value[key].map(o => getOpaqueOrg(o));
        } else {
          result[key] = anonymizeOrgs(value[key]);
        }
      }
      return result;
    }
    return value;
  }

  // Two-pass: first collect all org slugs, then anonymize free text
  // Pass 1: Walk the data to build the org mapping
  function collectOrgs(value) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      if (value.org && typeof value.org === 'string') getOpaqueOrg(value.org);
      if (value.org_slug && typeof value.org_slug === 'string') getOpaqueOrg(value.org_slug);
      if (Array.isArray(value.affected_orgs)) {
        value.affected_orgs.forEach(o => { if (typeof o === 'string') getOpaqueOrg(o); });
      }
      for (const key in value) collectOrgs(value[key]);
    } else if (Array.isArray(value)) {
      value.forEach(item => collectOrgs(item));
    }
  }

  collectOrgs(sanitized);

  // Pass 2: Replace all org references (structured fields + free text)
  return anonymizeOrgs(sanitized);
}

// =============================================================================
// Module Exports (for use by other scripts)
// =============================================================================

module.exports = { sanitizeReflection, sanitizeForExternalOutput };

// =============================================================================
// CLI Entry Point
// =============================================================================

function printUsage() {
  console.log('Usage: submit-reflection.js <path-to-reflection.json>');
  console.log('');
  console.log('Environment Variables:');
  console.log('  SUPABASE_URL              - Supabase project URL (required)');
  console.log('  SUPABASE_SERVICE_ROLE_KEY - Service role key (recommended - bypasses RLS)');
  console.log('  SUPABASE_ANON_KEY         - Anonymous API key (fallback - may fail due to RLS)');
  console.log('  USER_EMAIL                - Your email for attribution (optional)');
  console.log('');
  console.log('Example:');
  console.log('  node scripts/lib/submit-reflection.js .claude/SESSION_REFLECTION_2025-10-09.json');
}

// Only run CLI logic when executed directly (not when require()'d)
if (require.main === module) {
  const reflectionPath = process.argv[2];

  if (!reflectionPath) {
    console.error('❌ Missing required argument: path to reflection file');
    console.error('');
    printUsage();
    process.exit(1);
  }

  if (!fs.existsSync(reflectionPath)) {
    console.error('❌ File not found:', reflectionPath);
    process.exit(1);
  }

  // Run submission
  submitReflection(reflectionPath).catch(err => {
    console.error('❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}
