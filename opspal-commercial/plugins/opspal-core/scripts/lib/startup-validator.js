#!/usr/bin/env node

/**
 * Startup Validator
 *
 * Purpose: Early validation of environment variables and dependencies at module load time.
 * Mode: Warn-only - logs warnings but does NOT block execution.
 *
 * Addresses config/env cohort reflections:
 * - Missing environment variable validation (fail late, not early)
 * - Cryptic errors when env vars are undefined
 * - No early feedback on configuration issues
 *
 * Usage:
 *   // At the top of any script that needs env validation:
 *   require('./startup-validator').validate();
 *
 *   // Or for specific context:
 *   require('./startup-validator').validateForReflections();
 *   require('./startup-validator').validateForSupabase();
 *
 * Environment Variables Checked:
 *   - SUPABASE_URL: Supabase project URL
 *   - SUPABASE_ANON_KEY: Anonymous/public API key
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key for writes
 *   - ASANA_ACCESS_TOKEN: Asana API token
 *   - ASANA_WORKSPACE_ID: Asana workspace identifier
 */

const fs = require('fs');
const path = require('path');

// Track whether we've already shown warnings in this session
let warningsShown = false;

/**
 * Environment variable definitions by context
 */
const ENV_DEFINITIONS = {
  supabase: {
    required: [
      {
        name: 'SUPABASE_URL',
        description: 'Supabase project URL',
        example: 'https://your-project.supabase.co',
        pattern: /^https:\/\/[\w-]+\.supabase\.co$/
      }
    ],
    write_required: [
      {
        name: 'SUPABASE_SERVICE_ROLE_KEY',
        description: 'Service role key for write operations',
        example: 'eyJ...',
        sensitive: true,
        note: 'Anon key cannot update due to RLS policies - use service role key'
      }
    ],
    optional: [
      {
        name: 'SUPABASE_ANON_KEY',
        description: 'Anonymous/public API key for read operations',
        example: 'eyJ...',
        sensitive: true
      }
    ]
  },
  asana: {
    required: [
      {
        name: 'ASANA_ACCESS_TOKEN',
        description: 'Asana API access token',
        example: '1/1234567890:abc...',
        sensitive: true
      },
      {
        name: 'ASANA_WORKSPACE_ID',
        description: 'Asana workspace identifier',
        example: '1234567890',
        pattern: /^\d+$/
      }
    ],
    optional: [
      {
        name: 'ASANA_PROJECT_GID',
        description: 'Default Asana project for tasks',
        example: '1234567890',
        pattern: /^\d+$/
      }
    ]
  },
  salesforce: {
    required: [
      {
        name: 'SALESFORCE_ORG_ALIAS',
        description: 'Default Salesforce org alias',
        example: 'production',
        alternatives: ['SF_TARGET_ORG', 'SFDX_DEFAULTUSERNAME']
      }
    ],
    optional: [
      {
        name: 'SF_TARGET_ORG',
        description: 'Target org for CLI commands'
      },
      {
        name: 'SF_API_VERSION',
        description: 'Salesforce API version',
        default: '62.0'
      }
    ]
  }
};

/**
 * Load .env files from project root (walks up directory tree)
 */
function loadEnvFiles() {
  let current = process.cwd();

  for (let depth = 0; depth < 10; depth++) {
    const envPath = path.join(current, '.env');
    const envLocalPath = path.join(current, '.env.local');

    if (fs.existsSync(envPath)) {
      loadEnvFile(envPath);
    }
    if (fs.existsSync(envLocalPath)) {
      loadEnvFile(envLocalPath, true);
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

/**
 * Parse and load a single .env file
 */
function loadEnvFile(filePath, override = false) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return;

      const key = match[1];
      let value = match[2] || '';
      value = value.trim();

      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Only set if not already defined, or if override is true
      if (!process.env[key] || override) {
        process.env[key] = value;
      }
    });
  } catch (err) {
    // Silently ignore file read errors
  }
}

/**
 * Check if an environment variable is set (considering alternatives)
 */
function checkEnvVar(definition) {
  // Check primary variable
  if (process.env[definition.name]) {
    return { found: true, name: definition.name, value: process.env[definition.name] };
  }

  // Check alternatives
  if (definition.alternatives) {
    for (const alt of definition.alternatives) {
      if (process.env[alt]) {
        return { found: true, name: alt, value: process.env[alt], isAlternative: true };
      }
    }
  }

  return { found: false, name: definition.name };
}

/**
 * Format warning message for missing/invalid env vars
 */
function formatWarning(missing, context) {
  if (missing.length === 0) return null;

  const lines = [
    '',
    `\x1b[33m\u26A0\uFE0F  Missing recommended env vars for ${context}:\x1b[0m`
  ];

  missing.forEach(def => {
    const altText = def.alternatives ? ` (or ${def.alternatives.join(', ')})` : '';
    lines.push(`   \x1b[33m- ${def.name}${altText}\x1b[0m`);
    lines.push(`     ${def.description}`);
    if (def.example && !def.sensitive) {
      lines.push(`     Example: ${def.example}`);
    }
    if (def.note) {
      lines.push(`     \x1b[90mNote: ${def.note}\x1b[0m`);
    }
  });

  lines.push('');
  lines.push(`   \x1b[90mSet these in your .env file to avoid operation failures.\x1b[0m`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Validate environment variables for a specific context
 * Mode: Warn-only (does not block execution)
 *
 * @param {string[]} contexts - Contexts to validate: 'supabase', 'asana', 'salesforce'
 * @param {Object} options - Validation options
 * @param {boolean} options.includeWriteRequired - Include write-required vars (for update operations)
 * @param {boolean} options.silent - Suppress warning output
 * @returns {Object} Validation result with warnings
 */
function validate(contexts = ['supabase'], options = {}) {
  const { includeWriteRequired = false, silent = false } = options;

  // Ensure env files are loaded
  loadEnvFiles();

  const result = {
    valid: true,
    warnings: [],
    missing: [],
    found: []
  };

  for (const context of contexts) {
    const definitions = ENV_DEFINITIONS[context];
    if (!definitions) continue;

    // Check required vars
    const missingRequired = [];
    for (const def of definitions.required || []) {
      const check = checkEnvVar(def);
      if (check.found) {
        result.found.push({ context, ...check });
      } else {
        missingRequired.push(def);
        result.missing.push({ context, ...def });
      }
    }

    // Check write-required vars if needed
    if (includeWriteRequired) {
      for (const def of definitions.write_required || []) {
        const check = checkEnvVar(def);
        if (check.found) {
          result.found.push({ context, ...check });
        } else {
          missingRequired.push(def);
          result.missing.push({ context, ...def });
        }
      }
    }

    // Generate warning if any missing
    if (missingRequired.length > 0) {
      result.valid = false;
      const warning = formatWarning(missingRequired, context);
      if (warning) {
        result.warnings.push(warning);
      }
    }
  }

  // Output warnings (only once per session)
  if (!silent && !warningsShown && result.warnings.length > 0) {
    result.warnings.forEach(w => console.warn(w));
    warningsShown = true;
  }

  return result;
}

/**
 * Validate for reflection submission operations
 */
function validateForReflections() {
  return validate(['supabase'], { includeWriteRequired: false });
}

/**
 * Validate for Supabase write operations (updates, inserts)
 */
function validateForSupabase() {
  return validate(['supabase'], { includeWriteRequired: true });
}

/**
 * Validate for Asana operations
 */
function validateForAsana() {
  return validate(['asana']);
}

/**
 * Validate for Salesforce operations
 */
function validateForSalesforce() {
  return validate(['salesforce']);
}

/**
 * Validate for full reflection processing workflow
 * (Supabase + Asana)
 */
function validateForProcessReflections() {
  return validate(['supabase', 'asana'], { includeWriteRequired: true });
}

/**
 * Get status of all environment variables
 */
function getStatus() {
  loadEnvFiles();

  const status = {};

  for (const [context, definitions] of Object.entries(ENV_DEFINITIONS)) {
    status[context] = {
      required: [],
      write_required: [],
      optional: []
    };

    for (const category of ['required', 'write_required', 'optional']) {
      for (const def of definitions[category] || []) {
        const check = checkEnvVar(def);
        status[context][category].push({
          name: def.name,
          set: check.found,
          usedAlternative: check.isAlternative ? check.name : null,
          description: def.description
        });
      }
    }
  }

  return status;
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  switch (command) {
    case 'status':
      const status = getStatus();
      console.log('\n\x1b[1mEnvironment Variable Status\x1b[0m\n');

      for (const [context, categories] of Object.entries(status)) {
        console.log(`\x1b[36m${context.toUpperCase()}\x1b[0m`);

        for (const [category, vars] of Object.entries(categories)) {
          if (vars.length === 0) continue;
          console.log(`  ${category.replace('_', ' ')}:`);

          for (const v of vars) {
            const icon = v.set ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m';
            const altNote = v.usedAlternative ? ` (using ${v.usedAlternative})` : '';
            console.log(`    ${icon} ${v.name}${altNote}`);
          }
        }
        console.log('');
      }
      break;

    case 'validate':
      const context = args[1] || 'supabase';
      const result = validate([context], { includeWriteRequired: true });

      if (result.valid) {
        console.log(`\x1b[32m\u2713 All ${context} environment variables are set\x1b[0m`);
      }
      // Warnings already printed by validate()

      process.exit(result.valid ? 0 : 1);
      break;

    case 'help':
    default:
      console.log(`
Startup Validator - Early environment variable validation

Usage:
  node startup-validator.js [command] [context]

Commands:
  status              Show status of all environment variables
  validate [context]  Validate specific context (supabase, asana, salesforce)
  help                Show this help message

Examples:
  node startup-validator.js status
  node startup-validator.js validate supabase
  node startup-validator.js validate asana

Programmatic Usage:
  const { validate, validateForSupabase } = require('./startup-validator');

  // Validate and warn (does not block)
  validateForSupabase();

  // Check result
  const result = validate(['supabase'], { includeWriteRequired: true });
  if (!result.valid) {
    console.log('Missing:', result.missing);
  }
`);
      break;
  }
}

module.exports = {
  validate,
  validateForReflections,
  validateForSupabase,
  validateForAsana,
  validateForSalesforce,
  validateForProcessReflections,
  getStatus,
  loadEnvFiles,
  ENV_DEFINITIONS
};
