#!/usr/bin/env node

/**
 * Submit Reflection to Supabase
 *
 * Purpose: Submit session reflection JSON to centralized Supabase database
 * Usage: node scripts/lib/submit-reflection.js <path-to-reflection.json>
 *
 * Features:
 * - Extracts key metrics from reflection JSON
 * - Uses anonymous API key for read-only user access
 * - Validates payload before submission
 * - Provides detailed success/failure feedback
 *
 * Environment Variables:
 *   SUPABASE_URL - Supabase project URL (required)
 *   SUPABASE_ANON_KEY - Anonymous/public API key (required)
 *   USER_EMAIL - Optional: for attribution
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Error (missing config, invalid file, network failure)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

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
    quotedName: /"([A-Z][a-z]+\s[A-Z][a-z]+)"/g
  };

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
 * Script is in: .claude-plugins/{plugin}/scripts/lib/submit-reflection.js
 * Manifest is at: .claude-plugins/{plugin}/.claude-plugin/plugin.json
 */
function detectPluginInfo() {
  try {
    const scriptDir = __dirname; // .../scripts/lib
    const pluginRoot = path.resolve(scriptDir, '../..'); // Go up two levels
    const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');

    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      return {
        plugin_name: manifest.name || null,
        plugin_version: manifest.version || null
      };
    }
  } catch (err) {
    // Silent failure - plugin info is optional metadata
  }

  return {
    plugin_name: null,
    plugin_version: null
  };
}

// Import JSONB wrapper utility
const jsonbWrapperPath = path.resolve(__dirname, '../../../developer-tools-plugin/scripts/lib/supabase-jsonb-wrapper.js');
let wrapForSupabase, parseSupabaseError;

try {
  const jsonbWrapper = require(jsonbWrapperPath);
  wrapForSupabase = jsonbWrapper.wrapForSupabase;
  parseSupabaseError = jsonbWrapper.parseSupabaseError;
} catch (err) {
  // Fallback if wrapper not available (backwards compatibility)
  console.warn('⚠️  JSONB wrapper not found, using legacy format');
  wrapForSupabase = null;
  parseSupabaseError = (err) => err.message || 'Unknown error';
}

// Import data quality enforcer
const dataQualityEnforcerPath = path.resolve(__dirname, '../../../cross-platform-plugin/scripts/lib/reflection-data-quality-enforcer.js');
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

// Import taxonomy classifier
const taxonomyClassifierPath = path.resolve(__dirname, '../../../cross-platform-plugin/scripts/lib/taxonomy-classifier.js');
let TaxonomyClassifier;

try {
  ({ TaxonomyClassifier } = require(taxonomyClassifierPath));
} catch (err) {
  console.warn('⚠️  Taxonomy classifier not found, skipping taxonomy auto-fill');
  TaxonomyClassifier = null;
}

const TAXONOMY_NORMALIZATION = new Map([
  ['tool-contract mismatch', 'tool-contract'],
  ['tool-contract-mismatch', 'tool-contract'],
  ['prompt/llm mismatch', 'prompt-mismatch'],
  ['prompt/llm-mismatch', 'prompt-mismatch'],
  ['prompt/llm', 'prompt-mismatch'],
  ['schema-parse', 'schema/parse'],
  ['data quality', 'data-quality'],
  ['idempotency-state', 'idempotency/state'],
  ['external-api drift', 'external-api']
]);

function normalizeTaxonomy(taxonomy) {
  if (!taxonomy || typeof taxonomy !== 'string') return null;
  const trimmed = taxonomy.trim();
  if (!trimmed) return null;
  const normalized = TAXONOMY_NORMALIZATION.get(trimmed.toLowerCase());
  return normalized || trimmed;
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
  if (!Array.isArray(issues) || issues.length === 0) return;

  const classifier = TaxonomyClassifier ? new TaxonomyClassifier() : null;
  let normalizedCount = 0;
  let classifiedCount = 0;

  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') continue;

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

  if (normalizedCount || classifiedCount) {
    console.log(`🧭 Taxonomy cleanup: normalized ${normalizedCount}, auto-classified ${classifiedCount}`);
  }
}

/**
 * Main submission function
 */
async function submitReflection(reflectionPath) {
  loadEnvFromProjectRoot(process.cwd());

  // Read Supabase configuration from environment variables
  // Using anonymous key for reflection submission (RLS policy allows anonymous writes)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing Supabase configuration');
    console.error('   SUPABASE_URL and SUPABASE_ANON_KEY must be set (env or .env file).');
    console.error('   Example: export SUPABASE_URL="https://your-project.supabase.co"');
    process.exit(1);
  }

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
    console.log('   API Key (first 20 chars):', supabaseAnonKey.substring(0, 20) + '...');
    console.log('   User Email:', process.env.USER_EMAIL || '(anonymous)');
  }

  // Data quality validation (Phase 1 Critical Gap Closure)
  console.log('📊 Validating data quality...');
  const qualityResult = validateReflection(reflection);

  if (DEBUG || qualityResult.qualityScore < 50) {
    printValidationResult(qualityResult);
  }

  // Check if strict enforcement is enabled
  const strictMode = process.env.ENFORCE_DATA_QUALITY === '1';

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
      console.error('   2. Check that SUPABASE_ANON_KEY is valid');
      console.error('   3. Ensure reflections table exists in Supabase');
      console.error('   4. Test manually: curl -X GET "$SUPABASE_URL/rest/v1/reflections?limit=1" -H "apikey: $SUPABASE_ANON_KEY"');
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
  // Accept both "issues" and "issues_identified" for backwards compatibility
  const hasIssues = reflection.issues || reflection.issues_identified;
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

  // Lenient validation: issues field should exist but can be empty
  // This allows reflections for successful sessions with no errors
  if (!hasIssues) {
    console.warn('⚠️  Warning: No issues field found - initializing as empty array');
    console.warn('   This is acceptable for error-free sessions');
    reflection.issues = [];
    reflection.issues_identified = [];
  } else if (Array.isArray(hasIssues) && hasIssues.length === 0) {
    console.log('ℹ️  Note: Issues array is empty (error-free session)');
  } else if (!Array.isArray(hasIssues)) {
    console.error('❌ Validation error: issues/issues_identified must be an array');
    console.error('   Received type:', typeof hasIssues);
    console.error('');
    console.error('💡 Fix: Ensure issues is an array format:');
    console.error('   - issues: [] (empty for no issues)');
    console.error('   - issues: [{...}] (array of issue objects)');
    process.exit(1);
  }

  // Sanitize reflection data to remove PII and identifiable information
  console.log('🔒 Sanitizing reflection data...');
  reflection = sanitizeReflection(reflection);

  // Normalize field names for backwards compatibility
  // Accept both "issues" and "issues_identified"
  if (reflection.issues && !reflection.issues_identified) {
    reflection.issues_identified = reflection.issues;
  }

  // Extract session metadata
  const metadata = reflection.session_metadata || {};
  const issues = reflection.issues_identified || reflection.issues || [];

  applyTaxonomyImprovements(issues, reflection.summary);

  // Extract priority issues (P0 and P1 only)
  const priorityIssues = issues.filter(issue => {
    const priority = issue.priority || '';
    return priority === 'P0' || priority === 'P1';
  });

  // Auto-detect org from current directory if not provided
  let org = metadata.org || process.env.ORG_NAME || null;
  if (!org) {
    try {
      const cwd = process.cwd();
      // Try to extract org from common patterns:
      // /path/to/instances/hivemq/ -> "hivemq"
      // /path/to/hivemq-project/ -> "hivemq"
      const matches = cwd.match(/\/instances\/([^\/]+)/) ||
                     cwd.match(/\/([^\/]+)-project/) ||
                     cwd.match(/\/([^\/]+)$/);
      if (matches && matches[1] && matches[1] !== 'lib' && matches[1] !== 'scripts') {
        org = matches[1];
        console.log(`   Auto-detected org: ${org}`);
      }
    } catch (err) {
      // Ignore errors in org detection
    }
  }

  // Auto-detect focus area from issue taxonomies if not provided
  let focusArea = metadata.focus_area || null;
  if (!focusArea && issues.length > 0) {
    // Use most common taxonomy as focus area
    const taxonomies = issues.map(i => i.taxonomy).filter(Boolean);
    if (taxonomies.length > 0) {
      const counts = {};
      taxonomies.forEach(t => counts[t] = (counts[t] || 0) + 1);
      focusArea = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    }
  }

  // Calculate ROI from issues if not provided
  let roiValue = null;
  if (reflection.roi_analysis?.time_savings?.annual_value) {
    roiValue = parseROIValue(reflection.roi_analysis.time_savings.annual_value);
  } else {
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

  // Estimate duration if not provided
  let durationMinutes = metadata.duration_minutes || null;
  if (!durationMinutes && reflection.session_start && reflection.session_end) {
    const start = new Date(reflection.session_start);
    const end = new Date(reflection.session_end);
    durationMinutes = Math.round((end - start) / 60000);
  }

  // Extract diagnostic context if present (from plugin-doctor)
  const diagnosticContext = reflection.diagnostic_context || null;
  const infrastructureIssue = reflection.infrastructure_issue || false;

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
  if (roiValue) {
    console.log(`   ROI: $${roiValue.toLocaleString()}/year`);
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
        console.error('   - Check that SUPABASE_ANON_KEY is correct');
        console.error('   - Verify Row Level Security policies allow anonymous inserts');
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
    console.log('');
    console.log('📊 View in Supabase:');
    console.log(`   ${supabaseUrl.replace('/rest/v1', '')}/project/default/editor`);
    console.log('');
    console.log('📈 Query your reflections:');
    console.log('   node .claude-plugins/salesforce-plugin/scripts/lib/query-reflections.js recent');
    console.log('   node .claude-plugins/salesforce-plugin/scripts/lib/query-reflections.js topIssues');

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
// CLI Entry Point
// =============================================================================

function printUsage() {
  console.log('Usage: submit-reflection.js <path-to-reflection.json>');
  console.log('');
  console.log('Environment Variables:');
  console.log('  SUPABASE_URL       - Supabase project URL (required)');
  console.log('  SUPABASE_ANON_KEY  - Anonymous API key (required)');
  console.log('  USER_EMAIL         - Your email for attribution (optional)');
  console.log('');
  console.log('Example:');
  console.log('  node scripts/lib/submit-reflection.js .claude/SESSION_REFLECTION_2025-10-09.json');
}

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
