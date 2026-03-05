/**
 * Supabase Credential Validator
 *
 * Validates Supabase connection configuration and credentials
 * before operations to prevent "missing credentials" errors.
 *
 * Related reflections: db09cc94
 * ROI: $2,250/yr
 *
 * @module supabase-credential-validator
 */

const fs = require('fs');
const path = require('path');

// Required environment variables
const REQUIRED_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const OPTIONAL_VARS = ['SUPABASE_ANON_KEY', 'SUPABASE_JWT_SECRET'];

// Common Supabase URL patterns
const URL_PATTERNS = {
  cloud: /^https:\/\/[a-z0-9]+\.supabase\.co$/,
  selfHosted: /^https?:\/\/.+$/
};

/**
 * Check environment variables
 * @returns {Object} Environment check result
 */
function checkEnvironment() {
  const result = {
    valid: true,
    required: {},
    optional: {},
    missing: [],
    warnings: []
  };

  // Check required variables
  for (const varName of REQUIRED_VARS) {
    const value = process.env[varName];
    result.required[varName] = {
      present: !!value,
      length: value?.length || 0
    };

    if (!value) {
      result.valid = false;
      result.missing.push(varName);
    }
  }

  // Check optional variables
  for (const varName of OPTIONAL_VARS) {
    const value = process.env[varName];
    result.optional[varName] = {
      present: !!value,
      length: value?.length || 0
    };
  }

  // Validate URL format
  const url = process.env.SUPABASE_URL;
  if (url) {
    if (!URL_PATTERNS.cloud.test(url) && !URL_PATTERNS.selfHosted.test(url)) {
      result.warnings.push(`SUPABASE_URL format may be invalid: ${url}`);
    }
  }

  // Check key formats
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    // Service role key should be a JWT (starts with eyJ)
    if (!serviceKey.startsWith('eyJ')) {
      result.warnings.push('SUPABASE_SERVICE_ROLE_KEY does not appear to be a valid JWT');
    }

    // Check for common mistakes
    if (serviceKey.includes(' ')) {
      result.warnings.push('SUPABASE_SERVICE_ROLE_KEY contains spaces - may be incorrectly formatted');
    }

    if (serviceKey.length < 100) {
      result.warnings.push('SUPABASE_SERVICE_ROLE_KEY seems too short');
    }
  }

  return result;
}

/**
 * Test Supabase connection
 * @param {Object} credentials - Credentials to test (optional, uses env if not provided)
 * @returns {Promise<Object>} Connection test result
 */
async function testConnection(credentials = null) {
  const result = {
    success: false,
    responseTime: null,
    error: null,
    details: {}
  };

  const url = credentials?.url || process.env.SUPABASE_URL;
  const key = credentials?.key || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    result.error = 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY';
    return result;
  }

  try {
    const start = Date.now();

    // Try to fetch from Supabase REST API
    const response = await fetch(`${url}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    result.responseTime = Date.now() - start;
    result.details.statusCode = response.status;

    if (response.ok || response.status === 404) {
      // 404 is expected for root endpoint without table name
      result.success = true;
      result.details.message = 'Connection successful';
    } else if (response.status === 401) {
      result.error = 'Authentication failed - check SUPABASE_SERVICE_ROLE_KEY';
    } else if (response.status === 403) {
      result.error = 'Access forbidden - key may not have required permissions';
    } else {
      result.error = `Unexpected status: ${response.status}`;
    }
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      result.error = `Cannot connect to ${url} - check SUPABASE_URL`;
    } else if (err.message?.includes('fetch')) {
      result.error = 'Network error - check internet connection';
    } else {
      result.error = err.message;
    }
  }

  return result;
}

/**
 * Check .env file for Supabase configuration
 * @param {string} envPath - Path to .env file
 * @returns {Object} File check result
 */
function checkEnvFile(envPath = null) {
  const result = {
    found: false,
    path: null,
    hasSupabaseVars: false,
    vars: {},
    suggestions: []
  };

  // Look for .env file
  const searchPaths = envPath ? [envPath] : [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(process.env.HOME || '', '.env'),
    path.join(process.env.HOME || '', '.claude', '.env')
  ];

  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      result.found = true;
      result.path = searchPath;

      try {
        const content = fs.readFileSync(searchPath, 'utf8');
        const lines = content.split('\n');

        for (const line of lines) {
          const match = line.match(/^(SUPABASE_[A-Z_]+)\s*=\s*(.+)/);
          if (match) {
            result.hasSupabaseVars = true;
            result.vars[match[1]] = {
              present: true,
              hasValue: match[2].trim().length > 0,
              line: lines.indexOf(line) + 1
            };
          }
        }
      } catch (err) {
        result.error = `Could not read ${searchPath}: ${err.message}`;
      }

      break;
    }
  }

  if (!result.found) {
    result.suggestions.push(
      'Create a .env file with Supabase credentials',
      'Example:',
      '  SUPABASE_URL=https://your-project.supabase.co',
      '  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key'
    );
  } else if (!result.hasSupabaseVars) {
    result.suggestions.push(
      `Add Supabase variables to ${result.path}`,
      'Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return result;
}

/**
 * Load .env file variables
 * @param {string} envPath - Path to .env file
 * @returns {Object} Load result
 */
function loadEnvFile(envPath = null) {
  const result = {
    loaded: false,
    varsLoaded: 0,
    path: null
  };

  // Find .env file
  const envCheck = checkEnvFile(envPath);

  if (!envCheck.found) {
    return result;
  }

  result.path = envCheck.path;

  try {
    const content = fs.readFileSync(envCheck.path, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
        result.varsLoaded++;
      }
    }

    result.loaded = result.varsLoaded > 0;
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

/**
 * Full credential validation
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation result
 */
async function validateCredentials(options = {}) {
  const result = {
    valid: false,
    timestamp: new Date().toISOString(),
    checks: {},
    issues: [],
    suggestions: []
  };

  // Check if dotenv should be loaded
  if (options.loadEnv !== false) {
    const loadResult = loadEnvFile(options.envPath);
    result.checks.envFile = loadResult;
  }

  // Check environment variables
  result.checks.environment = checkEnvironment();

  if (result.checks.environment.missing.length > 0) {
    result.issues.push(`Missing environment variables: ${result.checks.environment.missing.join(', ')}`);
    result.suggestions.push(
      'Set the required environment variables:',
      '  export SUPABASE_URL=https://your-project.supabase.co',
      '  export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key'
    );
  }

  // Add warnings as issues
  for (const warning of result.checks.environment.warnings) {
    result.issues.push(warning);
  }

  // Test connection if env vars are present
  if (result.checks.environment.valid && options.testConnection !== false) {
    result.checks.connection = await testConnection();

    if (!result.checks.connection.success) {
      result.issues.push(result.checks.connection.error);
    }
  }

  // Determine overall validity
  result.valid = result.issues.length === 0;

  return result;
}

/**
 * Generate example .env content
 * @returns {string} Example .env content
 */
function generateExampleEnv() {
  return `# Supabase Configuration
# Get these from your Supabase project dashboard: https://app.supabase.com

# Required
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Optional
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_JWT_SECRET=your-jwt-secret-here
`;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'check':
      const envResult = checkEnvironment();
      console.log(JSON.stringify(envResult, null, 2));
      process.exit(envResult.valid ? 0 : 1);
      break;

    case 'test':
      testConnection().then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
      });
      break;

    case 'validate':
      const testConn = !args.includes('--skip-connection');
      validateCredentials({ testConnection: testConn }).then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.valid ? 0 : 1);
      });
      break;

    case 'env-file':
      const envPath = args[1];
      const fileResult = checkEnvFile(envPath);
      console.log(JSON.stringify(fileResult, null, 2));
      break;

    case 'example':
      console.log(generateExampleEnv());
      break;

    default:
      console.log(`Supabase Credential Validator

Usage:
  supabase-credential-validator.js check                Check environment variables
  supabase-credential-validator.js test                 Test Supabase connection
  supabase-credential-validator.js validate [options]   Full credential validation
  supabase-credential-validator.js env-file [path]      Check .env file
  supabase-credential-validator.js example              Generate example .env content

Options for validate:
  --skip-connection    Skip connection test

Required Environment Variables:
  SUPABASE_URL              Your Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY Service role key (not anon key)

Optional Environment Variables:
  SUPABASE_ANON_KEY         Anonymous/public key
  SUPABASE_JWT_SECRET       JWT secret for custom tokens

Examples:
  # Check environment
  node supabase-credential-validator.js check

  # Test connection
  node supabase-credential-validator.js test

  # Full validation
  node supabase-credential-validator.js validate

  # Generate example .env
  node supabase-credential-validator.js example > .env.example
`);
  }
}

module.exports = {
  REQUIRED_VARS,
  OPTIONAL_VARS,
  checkEnvironment,
  testConnection,
  checkEnvFile,
  loadEnvFile,
  validateCredentials,
  generateExampleEnv
};
