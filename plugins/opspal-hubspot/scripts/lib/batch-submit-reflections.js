#!/usr/bin/env node

/**
 * Batch Submit Reflections to Supabase
 *
 * Purpose: Find all unsubmitted reflection files and submit them to Supabase
 * Usage: node scripts/lib/batch-submit-reflections.js [options]
 *
 * Features:
 * - Searches multiple common locations for reflection files
 * - Uses enhanced submit-reflection.js with duplicate detection
 * - Reports summary of submitted/skipped/failed reflections
 * - Non-fatal errors (suitable for hooks and automation)
 *
 * Options:
 *   --max-age-days=N    Only submit reflections newer than N days (default: 90)
 *   --search-path=PATH  Additional path to search (can be repeated)
 *   --quick            Only search project root (faster, less thorough)
 *   --verbose          Show detailed output for each reflection
 *   --dry-run          Find reflections but don't submit them
 *
 * Exit Codes:
 *   0 - Success (even if some submissions failed - see results)
 *   1 - Fatal error (configuration, file system, etc.)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
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

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_MAX_AGE_DAYS = 90;
const DEFAULT_SEARCH_PATHS = [
  '.claude',                                  // Project root
  '../.claude',                               // Parent project
  '../../.claude',                            // Grandparent project
  '.claude/session-summaries',                // Alternative location
  '../*/instances/*',                         // Instance directories (one level up)
  '../../*/instances/*',                      // Instance directories (two levels up)
];

// =============================================================================
// COMMAND LINE PARSING
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    maxAgeDays: DEFAULT_MAX_AGE_DAYS,
    searchPaths: [],
    quick: false,
    verbose: false,
    dryRun: false
  };

  for (const arg of args) {
    if (arg.startsWith('--max-age-days=')) {
      options.maxAgeDays = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--search-path=')) {
      options.searchPaths.push(arg.split('=')[1]);
    } else if (arg === '--quick') {
      options.quick = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  return options;
}

function printUsage() {
  console.log('Usage: batch-submit-reflections.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --max-age-days=N       Only submit reflections newer than N days (default: 90)');
  console.log('  --search-path=PATH     Additional path to search for reflections');
  console.log('  --quick                Only search project root (faster)');
  console.log('  --verbose              Show detailed output');
  console.log('  --dry-run              Find reflections but don\'t submit');
  console.log('  --help, -h             Show this help message');
  console.log('');
  console.log('Environment Variables (required for submission):');
  console.log('  SUPABASE_URL       Supabase project URL');
  console.log('  SUPABASE_ANON_KEY  Supabase anon key');
  console.log('  (Auto-loads .env/.env.local from project root)');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/lib/batch-submit-reflections.js');
  console.log('  node scripts/lib/batch-submit-reflections.js --quick');
  console.log('  node scripts/lib/batch-submit-reflections.js --max-age-days=30 --verbose');
}

// =============================================================================
// FILE DISCOVERY
// =============================================================================

/**
 * Find all reflection JSON files in the given search paths
 *
 * @param {Array<string>} searchPaths - Paths to search
 * @param {number} maxAgeDays - Maximum age in days for reflections
 * @returns {Array<Object>} - Array of {path, timestamp, age} objects
 */
function findReflectionFiles(searchPaths, maxAgeDays) {
  const reflections = [];
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const pattern = /SESSION_REFLECTION[_-].*\.json$/;

  for (const searchPath of searchPaths) {
    try {
      // Handle glob patterns like */instances/*
      if (searchPath.includes('*')) {
        const globResults = expandGlob(searchPath);
        for (const expandedPath of globResults) {
          scanDirectory(expandedPath, pattern, maxAgeMs, now, reflections);
        }
      } else {
        scanDirectory(searchPath, pattern, maxAgeMs, now, reflections);
      }
    } catch (err) {
      // Silently skip paths that don't exist or can't be accessed
      // This is expected for some search paths
    }
  }

  // Sort by timestamp (oldest first)
  reflections.sort((a, b) => a.timestamp - b.timestamp);

  return reflections;
}

/**
 * Scan a directory for reflection files
 */
function scanDirectory(dirPath, pattern, maxAgeMs, now, results) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    return;
  }

  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    if (!pattern.test(file)) {
      continue;
    }

    const filePath = path.join(dirPath, file);
    const fileStat = fs.statSync(filePath);

    if (!fileStat.isFile()) {
      continue;
    }

    // Check age
    const age = now - fileStat.mtimeMs;
    if (age > maxAgeMs) {
      continue; // Too old
    }

    // Try to extract timestamp from filename
    const timestampMatch = file.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
    let timestamp = fileStat.mtimeMs;

    if (timestampMatch) {
      const [, year, month, day] = timestampMatch;
      timestamp = new Date(`${year}-${month}-${day}`).getTime();
    }

    results.push({
      path: path.resolve(filePath),
      timestamp: timestamp,
      age: Math.floor(age / (24 * 60 * 60 * 1000)) // age in days
    });
  }
}

/**
 * Simple glob expansion for patterns like ../star/instances/star
 * (Basic implementation - only handles star wildcards)
 */
function expandGlob(pattern) {
  const parts = pattern.split('/');
  const results = [''];

  for (const part of parts) {
    if (part === '*') {
      // Expand wildcard by listing directories
      const newResults = [];
      for (const base of results) {
        if (!base || !fs.existsSync(base)) continue;
        try {
          const entries = fs.readdirSync(base, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              newResults.push(path.join(base, entry.name));
            }
          }
        } catch (err) {
          // Skip errors
        }
      }
      results.splice(0, results.length, ...newResults);
    } else {
      // Regular path component
      for (let i = 0; i < results.length; i++) {
        results[i] = path.join(results[i], part);
      }
    }
  }

  return results.filter(p => fs.existsSync(p));
}

// =============================================================================
// SUBMISSION
// =============================================================================

/**
 * Submit a single reflection using submit-reflection.js
 *
 * @param {string} reflectionPath - Path to reflection file
 * @param {boolean} verbose - Show detailed output
 * @returns {Promise<Object>} - {success, skipped, output}
 */
function submitReflection(reflectionPath, verbose) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'submit-reflection.js');

    if (!fs.existsSync(scriptPath)) {
      resolve({
        success: false,
        skipped: false,
        output: 'Submit script not found: ' + scriptPath
      });
      return;
    }

    const proc = spawn('node', [scriptPath, reflectionPath], {
      env: process.env,
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      const fullOutput = output + errorOutput;

      // Check if submission was skipped (duplicate)
      const skipped = fullOutput.includes('already submitted') ||
                      fullOutput.includes('No action needed');

      // Success if exit code 0 (includes skipped reflections)
      const success = code === 0;

      if (verbose) {
        console.log(fullOutput);
      }

      resolve({
        success: success,
        skipped: skipped,
        output: fullOutput
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        skipped: false,
        output: `Failed to spawn submit script: ${err.message}`
      });
    });
  });
}

/**
 * Submit all reflections in batch
 */
async function submitAllReflections(reflections, options) {
  const results = {
    submitted: [],
    skipped: [],
    failed: []
  };

  for (const reflection of reflections) {
    const basename = path.basename(reflection.path);

    if (options.verbose) {
      console.log(`\n📄 Processing: ${basename} (${reflection.age} days old)`);
    } else {
      process.stdout.write('.');
    }

    if (options.dryRun) {
      console.log(`   [DRY RUN] Would submit: ${reflection.path}`);
      continue;
    }

    const result = await submitReflection(reflection.path, options.verbose);

    if (result.skipped) {
      results.skipped.push({
        path: reflection.path,
        reason: 'Already in database'
      });
    } else if (result.success) {
      results.submitted.push({
        path: reflection.path
      });
    } else {
      results.failed.push({
        path: reflection.path,
        error: result.output.substring(0, 200) // First 200 chars of error
      });
    }
  }

  if (!options.verbose && reflections.length > 0) {
    console.log(''); // New line after dots
  }

  return results;
}

// =============================================================================
// REPORTING
// =============================================================================

/**
 * Print summary report
 */
function printSummary(reflections, results, options) {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Batch Submission Results');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Found: ${reflections.length} reflection files`);

  if (options.dryRun) {
    console.log('   [DRY RUN MODE]');
  } else {
    console.log(`   ✅ Submitted: ${results.submitted.length}`);
    console.log(`   ⏭️  Skipped: ${results.skipped.length} (already in database)`);
    console.log(`   ❌ Failed: ${results.failed.length}`);
  }

  if (results.failed.length > 0 && !options.verbose) {
    console.log('');
    console.log('Failed submissions:');
    for (const failure of results.failed) {
      console.log(`   ❌ ${path.basename(failure.path)}`);
      console.log(`      ${failure.error.split('\n')[0]}`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (results.submitted.length > 0) {
    console.log('✅ Batch submission completed');
  } else if (reflections.length === 0) {
    console.log('ℹ️  No unsubmitted reflections found');
  } else if (results.skipped.length === reflections.length) {
    console.log('✅ All reflections already submitted');
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const options = parseArgs();

  loadEnvFromProjectRoot(process.cwd());

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('ℹ️  Supabase not configured (missing SUPABASE_URL/SUPABASE_ANON_KEY)');
    console.log('   Skipping batch submission (reflections remain local).');
    process.exit(0);
  }

  // Build search paths
  let searchPaths = [...DEFAULT_SEARCH_PATHS];

  if (options.quick) {
    // Quick mode: only search project root
    searchPaths = ['.claude'];
  }

  // Add user-specified paths
  if (options.searchPaths.length > 0) {
    searchPaths.push(...options.searchPaths);
  }

  if (options.verbose) {
    console.log('🔍 Searching for reflections...');
    console.log(`   Max age: ${options.maxAgeDays} days`);
    console.log(`   Search paths: ${searchPaths.length}`);
  } else {
    console.log('🔍 Searching for unsubmitted reflections...');
  }

  // Find all reflection files
  const reflections = findReflectionFiles(searchPaths, options.maxAgeDays);

  if (reflections.length === 0) {
    console.log('ℹ️  No reflection files found');
    process.exit(0);
  }

  if (options.verbose) {
    console.log(`   Found ${reflections.length} reflection files`);
  }

  // Submit all reflections
  if (options.dryRun) {
    console.log('');
    console.log('[DRY RUN] Would submit these reflections:');
    for (const reflection of reflections) {
      console.log(`   - ${path.basename(reflection.path)} (${reflection.age} days old)`);
    }
  }

  const results = await submitAllReflections(reflections, options);

  // Print summary
  printSummary(reflections, results, options);

  // Exit successfully even if some submissions failed
  // (This is important for hooks - we don't want to block /reflect)
  process.exit(0);
}

// Run main function
main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
