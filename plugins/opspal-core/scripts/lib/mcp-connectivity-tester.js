#!/usr/bin/env node

/**
 * MCP Connectivity Tester
 *
 * Tests connections to all configured MCP servers (Supabase, Asana, etc.).
 * Validates authentication, measures latency, and tests basic operations.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

class MCPConnectivityTester {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.serverName = options.serverName || null;
    this.timeout = options.timeout || 5000;
    this.envFile = options.envFile || process.env.ENV_FILE || null;
    this.envFileUsed = null;

    this.results = {
      servers: [],
      passed: true,
      errors: []
    };
  }

  /**
   * Test all MCP servers
   */
  async testAll() {
    console.log('🔌 Testing MCP server connectivity...\n');
    this.loadEnvIfMissing();

    // Get MCP servers from .mcp.json if available
    const servers = this.getMCPServers();

    if (servers.length === 0) {
      console.warn('⚠️ No MCP servers configured in .mcp.json');
      return { passed: true, servers: [], note: 'No servers configured' };
    }

    // Test each server
    for (const server of servers) {
      if (this.serverName && server.name !== this.serverName) {
        continue; // Skip if specific server requested
      }

      await this.testServer(server);
    }

    return this.generateSummary();
  }

  /**
   * Load .env values when required variables are missing
   */
  loadEnvIfMissing() {
    const required = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'ASANA_ACCESS_TOKEN',
      'GITHUB_TOKEN',
      'GOOGLE_APPLICATION_CREDENTIALS'
    ];

    if (required.every(key => process.env[key])) {
      return;
    }

    const envPath = this.resolveEnvPath();
    if (!envPath) {
      return;
    }

    const content = fs.readFileSync(envPath, 'utf8');
    const fileVars = {};

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) {
        continue;
      }

      const key = match[1];
      let value = match[2].trim();

      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else {
        value = value.split(/\s+#/)[0];
      }

      fileVars[key] = value;
    }

    for (const [key, value] of Object.entries(fileVars)) {
      if (value === '') {
        continue;
      }
      process.env[key] = value;
    }

    this.envFileUsed = envPath;
    if (this.verbose) {
      console.log(`  Loaded environment variables from ${envPath} (non-empty values override shell env)`);
    }
  }

  /**
   * Resolve .env path from repo root or home directory
   */
  resolveEnvPath() {
    const candidates = [];
    if (this.envFile) {
      candidates.push(path.resolve(this.envFile));
    }
    candidates.push(path.join(process.cwd(), '.env'));
    candidates.push(path.resolve(__dirname, '../../../..', '.env'));

    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      candidates.push(path.join(homeDir, '.env'));
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Get MCP servers from .mcp.json
   */
  getMCPServers() {
    const mcpConfigPath = path.join(process.cwd(), '.mcp.json');
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const homeMcpPath = homeDir ? path.join(homeDir, '.mcp.json') : null;
    const configPath = fs.existsSync(mcpConfigPath)
      ? mcpConfigPath
      : (homeMcpPath && fs.existsSync(homeMcpPath) ? homeMcpPath : null);

    if (!configPath) {
      return [];
    }

    try {
      const mcpConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const servers = [];

      // Extract server configurations
      if (mcpConfig.mcpServers) {
        for (const [name, config] of Object.entries(mcpConfig.mcpServers)) {
          servers.push({
            name,
            type: this.detectServerType(name, config),
            config
          });
        }
      }

      return servers;

    } catch (error) {
      console.error(`✗ Failed to parse .mcp.json: ${error.message}`);
      return [];
    }
  }

  /**
   * Detect server type from name and config
   */
  detectServerType(name, config) {
    const nameLower = name.toLowerCase();

    if (nameLower.includes('supabase')) return 'supabase';
    if (nameLower.includes('asana')) return 'asana';
    if (nameLower.includes('github')) return 'github';
    if (nameLower.includes('google') || nameLower.includes('drive')) return 'google-drive';
    if (nameLower.includes('hubspot')) return 'hubspot';
    if (nameLower.includes('n8n')) return 'n8n';
    if (nameLower.includes('lucid')) return 'lucid';
    if (nameLower.includes('monday')) return 'monday';
    if (nameLower.includes('salesforce') || nameLower.includes('sfdx')) return 'salesforce';
    if (nameLower.includes('playwright')) return 'playwright';
    if (nameLower.includes('context7')) return 'context7';

    return 'generic';
  }

  /**
   * Test individual MCP server
   */
  async testServer(server) {
    console.log(`🔍 Testing ${server.name}...`);

    const startTime = Date.now();
    const result = {
      name: server.name,
      type: server.type,
      status: 'unknown',
      latency: null,
      error: null,
      details: {}
    };

    try {
      // Test based on server type
      switch (server.type) {
        case 'supabase':
          await this.testSupabase(result);
          break;
        case 'asana':
          await this.testAsana(result);
          break;
        case 'github':
          await this.testGitHub(result);
          break;
        case 'google-drive':
          await this.testGoogleDrive(result);
          break;
        case 'hubspot':
          await this.testHubSpot(result);
          break;
        case 'n8n':
          await this.testN8N(result);
          break;
        case 'lucid':
          await this.testLucid(result);
          break;
        case 'monday':
          await this.testMonday(result);
          break;
        case 'salesforce':
          await this.testSalesforceDX(result);
          break;
        case 'playwright':
          await this.testPlaywright(result);
          break;
        case 'context7':
          await this.testContext7(result);
          break;
        default:
          await this.testGeneric(result, server);
      }

      result.latency = Date.now() - startTime;

      const warnStatuses = new Set(['configured', 'skipped', 'not_configured', 'rate_limited', 'unknown', 'schema_missing']);
      const failStatuses = new Set(['authentication_failed', 'error', 'invalid_credentials', 'dependency_missing']);

      if (result.status === 'connected') {
        console.log(`  ✓ ${server.name} - Connected (${result.latency}ms)`);
        if (this.verbose && result.details.version) {
          console.log(`    Version: ${result.details.version}`);
        }
      } else if (warnStatuses.has(result.status)) {
        console.log(`  ⚠️ ${server.name} - ${result.status}`);
        if (this.verbose && result.details.note) {
          console.log(`    Note: ${result.details.note}`);
        }
      } else {
        console.log(`  ✗ ${server.name} - ${result.status}`);
      }

      if (failStatuses.has(result.status)) {
        this.results.passed = false;
        this.results.errors.push({
          server: server.name,
          error: result.error || result.status
        });
      }

    } catch (error) {
      result.status = 'error';
      result.error = error.message;
      result.latency = Date.now() - startTime;

      console.log(`  ✗ ${server.name} - Connection failed`);
      console.log(`    Error: ${error.message}`);

      this.results.passed = false;
      this.results.errors.push({
        server: server.name,
        error: error.message
      });
    }

    this.results.servers.push(result);
  }

  /**
   * Test Supabase connection
   */
  async testSupabase(result) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      result.status = 'not_configured';
      result.error = 'Missing SUPABASE_URL or SUPABASE_ANON_KEY';
      return;
    }

    // Test REST API
    const baseUrl = supabaseUrl.replace(/\/+$/, '');
    const testUrl = `${baseUrl}/rest/v1/reflections?select=id&limit=1`;

    try {
      const response = await this.makeRequest(testUrl, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (response.statusCode === 200) {
        result.status = 'connected';
        result.details.authenticated = true;
        result.details.endpoint = baseUrl;
        try {
          const data = JSON.parse(response.body);
          if (Array.isArray(data)) {
            result.details.sampleCount = data.length;
          }
        } catch (e) {
          // Ignore parse errors
        }
      } else if (response.statusCode === 404) {
        result.status = 'schema_missing';
        result.error = 'Reflections table not accessible';
      } else if (response.statusCode === 401 || response.statusCode === 403) {
        result.status = 'authentication_failed';
        result.error = `HTTP ${response.statusCode}`;
      } else {
        result.status = 'error';
        result.error = `HTTP ${response.statusCode}`;
      }

    } catch (error) {
      result.status = 'error';
      result.error = `Connection failed: ${error.message}`;
    }
  }

  /**
   * Test Asana connection
   */
  async testAsana(result) {
    const asanaToken = process.env.ASANA_ACCESS_TOKEN;

    if (!asanaToken) {
      result.status = 'not_configured';
      result.error = 'Missing ASANA_ACCESS_TOKEN';
      return;
    }

    const testUrl = 'https://app.asana.com/api/1.0/users/me';

    try {
      const response = await this.makeRequest(testUrl, {
        headers: {
          'Authorization': `Bearer ${asanaToken}`
        }
      });

      if (response.statusCode === 200) {
        result.status = 'connected';
        result.details.authenticated = true;

        // Parse user info if available
        try {
          const data = JSON.parse(response.body);
          if (data.data && data.data.name) {
            result.details.user = data.data.name;
          }
        } catch (e) {
          // Ignore parse errors
        }

      } else if (response.statusCode === 401) {
        result.status = 'authentication_failed';
        result.error = 'Invalid token';
      } else {
        result.status = 'error';
        result.error = `HTTP ${response.statusCode}`;
      }

    } catch (error) {
      result.status = 'error';
      result.error = `Connection failed: ${error.message}`;
    }
  }

  /**
   * Test GitHub connection
   */
  async testGitHub(result) {
    const githubToken = process.env.GITHUB_TOKEN;

    if (!githubToken) {
      result.status = 'not_configured';
      result.error = 'Missing GITHUB_TOKEN';
      return;
    }

    const testUrl = 'https://api.github.com/user';

    try {
      const response = await this.makeRequest(testUrl, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'User-Agent': 'Claude-Code-Plugin-Doctor'
        }
      });

      if (response.statusCode === 200) {
        result.status = 'connected';
        result.details.authenticated = true;

        try {
          const data = JSON.parse(response.body);
          if (data.login) {
            result.details.user = data.login;
          }
        } catch (e) {
          // Ignore
        }

      } else if (response.statusCode === 401) {
        result.status = 'authentication_failed';
        result.error = 'Invalid token';
      } else {
        result.status = 'error';
        result.error = `HTTP ${response.statusCode}`;
      }

    } catch (error) {
      result.status = 'error';
      result.error = `Connection failed: ${error.message}`;
    }
  }

  /**
   * Test Google Drive connection
   */
  async testGoogleDrive(result) {
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!credentialsPath) {
      result.status = 'not_configured';
      result.error = 'Missing GOOGLE_APPLICATION_CREDENTIALS';
      return;
    }

    if (!fs.existsSync(credentialsPath)) {
      result.status = 'invalid_credentials';
      result.error = 'Credentials file not found';
      return;
    }

    // Can't easily test Google Drive without loading googleapis library
    // So we'll just verify credentials file exists
    result.status = 'configured';
    result.details.credentialsPath = credentialsPath;
    result.details.note = 'Credentials file exists (full test requires googleapis)';
  }

  /**
   * Test HubSpot connection
   */
  async testHubSpot(result) {
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    const apiKey = process.env.HUBSPOT_API_KEY;

    if (!accessToken && !apiKey) {
      result.status = 'not_configured';
      result.error = 'Missing HUBSPOT_ACCESS_TOKEN or HUBSPOT_API_KEY';
      return;
    }

    let url = 'https://api.hubapi.com/crm/v3/objects/companies?limit=1';
    const headers = {};

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    } else {
      url += `&hapikey=${encodeURIComponent(apiKey)}`;
    }

    try {
      const response = await this.makeRequest(url, { headers });

      if (response.statusCode === 200) {
        result.status = 'connected';
        result.details.authenticated = true;
        result.details.authType = accessToken ? 'access_token' : 'api_key';
      } else if (response.statusCode === 401 || response.statusCode === 403) {
        result.status = 'authentication_failed';
        result.error = `HTTP ${response.statusCode}`;
      } else if (response.statusCode === 429) {
        result.status = 'rate_limited';
        result.error = 'HubSpot rate limit hit';
      } else {
        result.status = 'error';
        result.error = `HTTP ${response.statusCode}`;
      }
    } catch (error) {
      result.status = 'error';
      result.error = `Connection failed: ${error.message}`;
    }
  }

  /**
   * Test n8n connection
   */
  async testN8N(result) {
    const apiKey = process.env.N8N_API_KEY;
    const apiUrl = process.env.N8N_API_URL;
    const baseUrl = process.env.N8N_BASE_URL;

    if (!apiKey) {
      result.status = 'not_configured';
      result.error = 'Missing N8N_API_KEY';
      return;
    }

    const resolvedBase = apiUrl || baseUrl;
    if (!resolvedBase || resolvedBase.includes('your-instance.n8n.cloud')) {
      result.status = 'not_configured';
      result.error = 'Missing N8N_BASE_URL or N8N_API_URL';
      return;
    }

    const trimmedBase = resolvedBase.replace(/\/+$/, '');
    const apiBase = trimmedBase.includes('/api/v1')
      ? trimmedBase
      : `${trimmedBase}/api/v1`;
    const url = `${apiBase}/workflows?limit=1`;

    try {
      const response = await this.makeRequest(url, {
        headers: {
          'X-N8N-API-KEY': apiKey
        }
      });

      if (response.statusCode === 200) {
        result.status = 'connected';
        result.details.authenticated = true;
      } else if (response.statusCode === 401 || response.statusCode === 403) {
        result.status = 'authentication_failed';
        result.error = `HTTP ${response.statusCode}`;
      } else if (response.statusCode === 429) {
        result.status = 'rate_limited';
        result.error = 'n8n rate limit hit';
      } else {
        result.status = 'error';
        result.error = `HTTP ${response.statusCode}`;
      }
    } catch (error) {
      result.status = 'error';
      result.error = `Connection failed: ${error.message}`;
    }
  }

  /**
   * Test Lucid connection
   */
  async testLucid(result) {
    const token = process.env.LUCID_API_TOKEN;
    const baseUrl = (process.env.LUCID_API_BASE_URL || 'https://api.lucid.co').replace(/\/+$/, '');

    if (!token) {
      result.status = 'not_configured';
      result.error = 'Missing LUCID_API_TOKEN';
      return;
    }

    const url = `${baseUrl}/user`;

    try {
      const response = await this.makeRequest(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.statusCode === 200) {
        result.status = 'connected';
        result.details.authenticated = true;
      } else if (response.statusCode === 401 || response.statusCode === 403) {
        result.status = 'authentication_failed';
        result.error = `HTTP ${response.statusCode}`;
      } else if (response.statusCode === 429) {
        result.status = 'rate_limited';
        result.error = 'Lucid rate limit hit';
      } else {
        result.status = 'error';
        result.error = `HTTP ${response.statusCode}`;
      }
    } catch (error) {
      result.status = 'error';
      result.error = `Connection failed: ${error.message}`;
    }
  }

  /**
   * Test Monday connection
   */
  async testMonday(result) {
    const token = process.env.MONDAY_API_TOKEN;

    if (!token) {
      result.status = 'not_configured';
      result.error = 'Missing MONDAY_API_TOKEN';
      return;
    }

    const url = 'https://api.monday.com/v2';
    const body = JSON.stringify({ query: 'query { me { id name email } }' });

    try {
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        },
        body
      });

      if (response.statusCode !== 200) {
        result.status = response.statusCode === 401 || response.statusCode === 403
          ? 'authentication_failed'
          : 'error';
        result.error = `HTTP ${response.statusCode}`;
        return;
      }

      try {
        const data = JSON.parse(response.body);
        if (data.errors && data.errors.length > 0) {
          const message = data.errors[0].message || 'Monday API error';
          result.status = 'authentication_failed';
          result.error = message;
          return;
        }

        result.status = 'connected';
        result.details.authenticated = true;
        if (data.data && data.data.me && data.data.me.email) {
          result.details.user = data.data.me.email;
        }
      } catch (error) {
        result.status = 'error';
        result.error = `Invalid response: ${error.message}`;
      }
    } catch (error) {
      result.status = 'error';
      result.error = `Connection failed: ${error.message}`;
    }
  }

  /**
   * Test Salesforce DX connection via CLI
   */
  async testSalesforceDX(result) {
    const targetOrg = process.env.SF_TARGET_ORG || process.env.SFDX_ALIAS || process.env.SF_ALIAS;

    if (!targetOrg) {
      result.status = 'not_configured';
      result.error = 'Missing SF_TARGET_ORG';
      return;
    }

    try {
      await execFileAsync('sf', ['--version']);
    } catch (error) {
      result.status = 'dependency_missing';
      result.error = 'Salesforce CLI (sf) not installed';
      return;
    }

    try {
      const { stdout } = await execFileAsync('sf', ['org', 'display', '--target-org', targetOrg, '--json']);
      const parsed = JSON.parse(stdout);
      if (parsed.status === 0) {
        result.status = 'connected';
        result.details.authenticated = true;
        result.details.org = parsed.result?.alias || parsed.result?.username || targetOrg;
      } else {
        result.status = 'authentication_failed';
        result.error = parsed.message || 'sf org display failed';
      }
    } catch (error) {
      result.status = 'authentication_failed';
      result.error = error.message;
    }
  }

  /**
   * Test Playwright MCP readiness
   */
  async testPlaywright(result) {
    try {
      require.resolve('playwright');
      result.status = 'configured';
      result.details.note = 'Playwright package resolved (MCP server runs via npx)';
    } catch (error) {
      result.status = 'dependency_missing';
      result.error = 'Playwright package not installed';
    }
  }

  /**
   * Test Context7 MCP readiness
   */
  async testContext7(result) {
    const apiKey = process.env.CONTEXT7_API_KEY;
    const hasApiKey = Boolean(apiKey && apiKey.trim());

    // Context7 can run without an API key (limited mode), but key is recommended.
    result.status = 'configured';
    result.details.authentication = hasApiKey ? 'api_key_configured' : 'limited_mode_no_api_key';

    try {
      const resolved = require.resolve('@upstash/context7-mcp/package.json');
      result.details.package = 'installed_locally';
      result.details.packagePath = resolved;
    } catch (_) {
      // Not a hard failure because .mcp.json runs Context7 through npx.
      result.details.package = 'resolved_via_npx_at_runtime';
    }

    result.details.note = hasApiKey
      ? 'Context7 MCP configured with API key. Validate runtime health with `claude mcp list`.'
      : 'Context7 MCP configured without API key (limited mode). Set CONTEXT7_API_KEY for higher limits.';
  }

  /**
   * Test generic MCP server
   */
  async testGeneric(result, server) {
    // For generic servers, we can't test without more info
    result.status = 'skipped';
    result.details.note = 'Generic server type - manual testing required';
  }

  /**
   * Make HTTP/HTTPS request
   */
  makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: this.timeout
      };

      const req = lib.request(reqOptions, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  /**
   * Generate summary report
   */
  generateSummary() {
    const totalServers = this.results.servers.length;
    const connected = this.results.servers.filter(s => s.status === 'connected').length;
    const configured = this.results.servers.filter(s => s.status === 'configured').length;
    const skipped = this.results.servers.filter(s => s.status === 'skipped').length;
    const notConfigured = this.results.servers.filter(s => s.status === 'not_configured').length;
    const errors = this.results.errors.length;

    console.log('\n' + '─'.repeat(60));
    console.log('🔌 MCP CONNECTIVITY SUMMARY');
    console.log('─'.repeat(60));

    if (totalServers === 0) {
      console.log('No MCP servers configured');
    } else {
      console.log(`Total servers: ${totalServers}`);
      console.log(`Connected: ${connected}`);
      if (configured > 0) {
        console.log(`Configured: ${configured} (not fully tested)`);
      }
      if (skipped > 0) {
        console.log(`Skipped: ${skipped} (no probe available)`);
      }
      if (notConfigured > 0) {
        console.log(`Not configured: ${notConfigured}`);
      }
      if (errors > 0) {
        console.log(`Errors: ${errors}`);
      }

      console.log('\nServer Details:');
      for (const server of this.results.servers) {
        const warningStatuses = new Set(['configured', 'skipped', 'not_configured', 'rate_limited', 'schema_missing']);
        const icon = server.status === 'connected' ? '✓' :
                     warningStatuses.has(server.status) ? '○' : '✗';
        const latency = server.latency ? ` (${server.latency}ms)` : '';
        console.log(`  ${icon} ${server.name}: ${server.status}${latency}`);

        if (server.error && this.verbose) {
          console.log(`    Error: ${server.error}`);
        }

        if (server.status === 'not_configured') {
          console.log(`    Fix: ${server.error}`);
        }

        if (server.status === 'authentication_failed') {
          console.log(`    Fix: Verify authentication token/key`);
        }

        if (server.status === 'dependency_missing') {
          console.log(`    Fix: Install required dependency`);
        }
      }
    }

    console.log('─'.repeat(60));

    const allConnected = connected === totalServers && totalServers > 0;
    const status = allConnected ? 'ALL CONNECTED ✓' :
                   errors === 0 ? 'PARTIAL ⚠️' : 'ERRORS DETECTED ✗';

    console.log(`Overall Status: ${status}`);
    console.log('─'.repeat(60) + '\n');

    return {
      passed: this.results.passed,
      servers: this.results.servers,
      errors: this.results.errors,
      summary: {
        total: totalServers,
        connected,
        configured,
        skipped,
        notConfigured,
        errors
      }
    };
  }

  /**
   * Get JSON report
   */
  getJSONReport() {
    return {
      timestamp: new Date().toISOString(),
      servers: this.results.servers,
      errors: this.results.errors,
      summary: {
        total: this.results.servers.length,
        connected: this.results.servers.filter(s => s.status === 'connected').length,
        configured: this.results.servers.filter(s => s.status === 'configured').length,
        skipped: this.results.servers.filter(s => s.status === 'skipped').length,
        notConfigured: this.results.servers.filter(s => s.status === 'not_configured').length,
        errors: this.results.errors.length,
        passed: this.results.passed
      }
    };
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    json: args.includes('--json')
  };

  // Get server name if specified
  const serverFlag = args.indexOf('--server');
  if (serverFlag !== -1 && args[serverFlag + 1]) {
    options.serverName = args[serverFlag + 1];
  }

  // Get timeout if specified
  const timeoutFlag = args.indexOf('--timeout');
  if (timeoutFlag !== -1 && args[timeoutFlag + 1]) {
    options.timeout = parseInt(args[timeoutFlag + 1], 10);
  }

  const envFlag = args.indexOf('--env-file');
  if (envFlag !== -1 && args[envFlag + 1]) {
    options.envFile = args[envFlag + 1];
  } else {
    const envArg = args.find(arg => arg.startsWith('--env-file='));
    if (envArg) {
      options.envFile = envArg.split('=').slice(1).join('=');
    }
  }

  if (options.envFile) {
    process.env.ENV_FILE = options.envFile;
  }

  const tester = new MCPConnectivityTester(options);

  tester.testAll().then(result => {
    if (options.json) {
      console.log(JSON.stringify(tester.getJSONReport(), null, 2));
    }

    process.exit(result.passed ? 0 : 1);
  }).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(2);
  });
}

module.exports = MCPConnectivityTester;
