#!/usr/bin/env node

/**
 * Batch Submit Reflections to Supabase
 *
 * Purpose: Find and submit all pending reflection files that haven't been submitted yet
 * Usage: node scripts/lib/batch-submit-reflections.js [options]
 *
 * Features:
 * - Searches for SESSION_REFLECTION_*.json files
 * - Skips reflections that have already been submitted (marker file check)
 * - Requires SUPABASE_URL and SUPABASE_ANON_KEY to be set
 * - Non-fatal errors (always exits with code 0)
 * - Progress reporting and summary
 *
 * Options:
 *   --quick              Fast mode: only search project root .claude/ directory
 *   --verbose            Show detailed output for each submission
 *   --max-age-days=N     Only submit reflections newer than N days
 *   --help               Show usage information
 *
 * Environment Variables:
 *   SUPABASE_URL         - Supabase project URL (required)
 *   SUPABASE_ANON_KEY    - Supabase anon key (required)
 *   USER_EMAIL           - Optional: For attribution
 *
 * Exit Codes:
 *   0 - Always (non-fatal design for use in hooks)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

// Colors for output
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    quick: false,
    verbose: false,
    maxAgeDays: null,
    help: false
  };

  for (const arg of args) {
    if (arg === '--quick') {
      flags.quick = true;
    } else if (arg === '--verbose') {
      flags.verbose = true;
    } else if (arg.startsWith('--max-age-days=')) {
      flags.maxAgeDays = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    }
  }

  return flags;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Batch Submit Reflections to Supabase');
  console.log('');
  console.log('Usage: batch-submit-reflections.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --quick              Fast mode: only search project root .claude/ directory');
  console.log('  --verbose            Show detailed output for each submission');
  console.log('  --max-age-days=N     Only submit reflections newer than N days');
  console.log('  --help               Show this help message');
  console.log('');
  console.log('Environment Variables:');
  console.log('  SUPABASE_URL         Supabase project URL (required)');
  console.log('  SUPABASE_ANON_KEY    Supabase anon key (required)');
  console.log('  (Auto-loads .env/.env.local from project root)');
  console.log('  USER_EMAIL           Your email for attribution (optional)');
  console.log('');
  console.log('Examples:');
  console.log('  node batch-submit-reflections.js --quick');
  console.log('  node batch-submit-reflections.js --verbose --max-age-days=7');
  console.log('  BATCH_SUBMIT_VERBOSE=1 node batch-submit-reflections.js');
}

/**
 * Find all reflection files in search paths
 *
 * @param {boolean} quickMode - Only search project root if true
 * @returns {string[]} - Array of absolute file paths
 */
function findReflectionFiles(quickMode = false) {
  const files = [];
  const searchPaths = [];

  if (quickMode) {
    // Quick mode: only search project root .claude/ directory
    const projectRoot = process.cwd();
    const claudeDir = path.join(projectRoot, '.claude');
    if (fs.existsSync(claudeDir)) {
      searchPaths.push(claudeDir);
    }
  } else {
    // Thorough mode: search common locations
    const projectRoot = process.cwd();
    const homeDir = process.env.HOME || process.env.USERPROFILE;

    const candidatePaths = [
      path.join(projectRoot, '.claude'),
      path.join(homeDir, '.claude'),
      path.join(homeDir, 'Desktop', 'RevPal', 'Agents', 'opspal-internal-plugins', '.claude'),
      path.join(homeDir, 'Desktop', 'RevPal', 'Agents', 'opspal-internal', '.claude')
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p) && !searchPaths.includes(p)) {
        searchPaths.push(p);
      }
    }
  }

  // Search each path for SESSION_REFLECTION_*.json files
  for (const searchPath of searchPaths) {
    try {
      const dirFiles = fs.readdirSync(searchPath);
      for (const file of dirFiles) {
        if (file.startsWith('SESSION_REFLECTION_') && file.endsWith('.json') && !file.includes('_SUPABASE')) {
          files.push(path.join(searchPath, file));
        }
      }
    } catch (err) {
      // Skip directories we can't read
      continue;
    }
  }

  return files;
}

/**
 * Check if reflection has already been submitted
 *
 * @param {string} reflectionPath - Path to reflection JSON file
 * @returns {boolean} - True if already submitted
 */
function isAlreadySubmitted(reflectionPath) {
  // Check for marker file (legacy approach)
  const markerPath = reflectionPath.replace('.json', '_SUPABASE.json');
  if (fs.existsSync(markerPath)) {
    return true;
  }

  // Could also check Supabase directly, but marker file is faster
  return false;
}

/**
 * Check if reflection is within max age
 *
 * @param {string} reflectionPath - Path to reflection JSON file
 * @param {number|null} maxAgeDays - Maximum age in days, or null for no limit
 * @returns {boolean} - True if within age limit
 */
function isWithinAgeLimit(reflectionPath, maxAgeDays) {
  if (maxAgeDays === null) {
    return true; // No age limit
  }

  try {
    const stats = fs.statSync(reflectionPath);
    const fileAgeMs = Date.now() - stats.mtimeMs;
    const fileAgeDays = fileAgeMs / (1000 * 60 * 60 * 24);
    return fileAgeDays <= maxAgeDays;
  } catch (err) {
    return false; // Can't determine age, skip
  }
}

/**
 * Create marker file to indicate submission success
 *
 * @param {string} reflectionPath - Path to reflection JSON file
 */
function createMarkerFile(reflectionPath) {
  const markerPath = reflectionPath.replace('.json', '_SUPABASE.json');
  try {
    fs.writeFileSync(markerPath, JSON.stringify({
      submitted_at: new Date().toISOString(),
      submitted_by: 'batch-submit-reflections.js'
    }, null, 2));
  } catch (err) {
    // Non-fatal: marker file creation failed
    // Submission still succeeded, just won't have local marker
  }
}

/**
 * Submit a single reflection using submit-reflection.js
 *
 * @param {string} reflectionPath - Path to reflection JSON file
 * @param {boolean} verbose - Show detailed output
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
async function submitReflection(reflectionPath, verbose = false) {
  const submitScript = path.resolve(__dirname, 'submit-reflection.js');

  if (!fs.existsSync(submitScript)) {
    return {
      success: false,
      error: 'Submit script not found: ' + submitScript
    };
  }

  try {
    // Call submit-reflection.js as a child process
    // Capture stdout/stderr for processing
    const result = execSync(
      `node "${submitScript}" "${reflectionPath}"`,
      {
        encoding: 'utf-8',
        stdio: verbose ? 'inherit' : 'pipe', // Show output in verbose mode
        env: {
          ...process.env
        }
      }
    );

    // Check if submission was successful
    if (result.includes('✅ Reflection submitted successfully') || result.includes('⏭️  Reflection already submitted')) {
      return { success: true, error: null };
    }

    return {
      success: false,
      error: 'Unknown error (no success message)'
    };

  } catch (err) {
    // Submission failed
    const errorMsg = err.stderr || err.message || 'Unknown error';
    return {
      success: false,
      error: errorMsg.substring(0, 200) // Truncate long errors
    };
  }
}

/**
 * Main batch submission function
 */
async function batchSubmitReflections() {
  const flags = parseArgs();

  if (flags.help) {
    printUsage();
    process.exit(0);
  }

  loadEnvFromProjectRoot(process.cwd());

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log(`${YELLOW}ℹ️  Supabase not configured (missing SUPABASE_URL/SUPABASE_ANON_KEY)${RESET}`);
    console.log(`${GRAY}   Skipping batch submission (reflections remain local).${RESET}`);
    process.exit(0);
  }

  const verbose = flags.verbose || process.env.BATCH_SUBMIT_VERBOSE === '1';

  if (verbose) {
    console.log(`${CYAN}🔍 Searching for unsubmitted reflections...${RESET}`);
    console.log(`${GRAY}   Mode: ${flags.quick ? 'quick (project root only)' : 'thorough (all locations)'}${RESET}`);
    if (flags.maxAgeDays) {
      console.log(`${GRAY}   Max age: ${flags.maxAgeDays} days${RESET}`);
    }
    console.log('');
  }

  // Find all reflection files
  const allFiles = findReflectionFiles(flags.quick);

  if (verbose) {
    console.log(`${GRAY}   Found ${allFiles.length} reflection file(s)${RESET}`);
  }

  // Filter out already-submitted and too-old reflections
  const pendingFiles = allFiles.filter(file => {
    if (isAlreadySubmitted(file)) {
      if (verbose) {
        console.log(`${GRAY}   ⏭️  Skipping (already submitted): ${path.basename(file)}${RESET}`);
      }
      return false;
    }

    if (!isWithinAgeLimit(file, flags.maxAgeDays)) {
      if (verbose) {
        console.log(`${GRAY}   ⏭️  Skipping (too old): ${path.basename(file)}${RESET}`);
      }
      return false;
    }

    return true;
  });

  if (pendingFiles.length === 0) {
    if (verbose) {
      console.log(`${GREEN}✅ No pending reflections to submit${RESET}`);
    } else {
      console.log(`${CYAN}ℹ️  No pending reflections found${RESET}`);
    }
    process.exit(0);
  }

  if (verbose) {
    console.log(`${CYAN}📤 Submitting ${pendingFiles.length} reflection(s)...${RESET}`);
    console.log('');
  }

  // Submit each reflection
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  const errors = [];

  for (const reflectionPath of pendingFiles) {
    const fileName = path.basename(reflectionPath);

    if (verbose) {
      console.log(`${CYAN}   Processing: ${fileName}${RESET}`);
    }

    const result = await submitReflection(reflectionPath, verbose);

    if (result.success) {
      successCount++;
      createMarkerFile(reflectionPath); // Create marker for next run
      if (verbose) {
        console.log(`${GREEN}   ✅ Submitted successfully${RESET}`);
      }
    } else {
      // Check if it was skipped (already exists in DB)
      if (result.error && result.error.includes('already submitted')) {
        skippedCount++;
        createMarkerFile(reflectionPath); // Create marker to avoid retrying
        if (verbose) {
          console.log(`${YELLOW}   ⏭️  Already in database${RESET}`);
        }
      } else {
        failureCount++;
        errors.push({ file: fileName, error: result.error });
        if (verbose) {
          console.log(`${RED}   ❌ Failed: ${result.error}${RESET}`);
        }
      }
    }

    if (verbose) {
      console.log('');
    }
  }

  // Print summary
  console.log('');
  if (successCount > 0 || skippedCount > 0) {
    console.log(`${GREEN}✅ Batch submission completed${RESET}`);
    console.log(`${GRAY}   Submitted: ${successCount}${RESET}`);
    if (skippedCount > 0) {
      console.log(`${GRAY}   Already in DB: ${skippedCount}${RESET}`);
    }
    if (failureCount > 0) {
      console.log(`${YELLOW}   Failed: ${failureCount}${RESET}`);
    }
  } else {
    console.log(`${RED}❌ All submissions failed${RESET}`);
    console.log(`${GRAY}   Failed: ${failureCount}${RESET}`);
  }

  // Show errors if any
  if (errors.length > 0 && !verbose) {
    console.log('');
    console.log(`${YELLOW}Errors:${RESET}`);
    for (const { file, error } of errors) {
      console.log(`${GRAY}   ${file}: ${error}${RESET}`);
    }
  }

  if (failureCount > 0) {
    console.log('');
    console.log(`${CYAN}💡 Tip: Run with --verbose to see detailed error messages${RESET}`);
  }

  // Always exit successfully (non-fatal design)
  process.exit(0);
}

// =============================================================================
// CLI Entry Point
// =============================================================================

// Skip in test environment
if (process.env.CI || process.env.CLAUDE_TEST_MODE) {
  console.log('ℹ️  Skipping batch submission in test environment');
  process.exit(0);
}

// Run batch submission
batchSubmitReflections().catch(err => {
  console.error(`${RED}❌ Fatal error: ${err.message}${RESET}`);
  if (process.env.BATCH_SUBMIT_VERBOSE === '1') {
    console.error(err.stack);
  }
  // Still exit successfully (non-fatal design)
  process.exit(0);
});
