#!/usr/bin/env node

/**
 * Submit Reflection to Supabase (Shim)
 *
 * This file delegates to the canonical version in opspal-core.
 * All reflection submission logic is maintained in a single location
 * to prevent drift between plugin copies.
 *
 * Canonical location: plugins/opspal-core/scripts/lib/submit-reflection.js
 */

const path = require('path');
const fs = require('fs');

// Resolve the canonical submit-reflection.js from opspal-core
const candidatePaths = [
  // Relative from this plugin's scripts/lib/
  path.resolve(__dirname, '../../../opspal-core/scripts/lib/submit-reflection.js'),
  // Installed plugin path
  path.resolve(__dirname, '../../../../.claude-plugins/opspal-core/scripts/lib/submit-reflection.js'),
  // Marketplace path
  path.resolve(process.env.HOME || '', '.claude/plugins/opspal-core@revpal-internal-plugins/scripts/lib/submit-reflection.js'),
];

let canonicalPath;
for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    canonicalPath = p;
    break;
  }
}

if (!canonicalPath) {
  console.error('❌ Cannot find canonical submit-reflection.js from opspal-core.');
  console.error('   Searched paths:');
  candidatePaths.forEach(p => console.error(`   - ${p}`));
  console.error('\n   Ensure opspal-core plugin is installed.');
  process.exit(1);
}

// Re-export module functions for require() consumers
const canonical = require(canonicalPath);
if (canonical.sanitizeReflection) module.exports = canonical;

// CLI delegation: when run directly, execute the canonical script
if (require.main === module) {
  // Re-run the canonical script with the same argv
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [canonicalPath, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: process.env
    });
  } catch (err) {
    process.exit(err.status || 1);
  }
}
