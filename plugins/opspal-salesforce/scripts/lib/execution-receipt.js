#!/usr/bin/env node
/**
 * Execution Receipt — Re-export from opspal-core shared library
 *
 * The canonical execution-receipt library lives in opspal-core/scripts/lib/execution-receipt.js
 * and is shared across all platform plugins (Salesforce, HubSpot, Marketo).
 *
 * This file re-exports it for backward compatibility with existing Salesforce imports.
 *
 * @version 1.1.0
 */

const path = require('path');

// Resolve the shared library from opspal-core
const corePaths = [
  path.resolve(__dirname, '../../../opspal-core/scripts/lib/execution-receipt.js'),
  path.resolve(__dirname, '../../../../plugins/opspal-core/scripts/lib/execution-receipt.js')
];

let sharedLib = null;
for (const p of corePaths) {
  try {
    sharedLib = require(p);
    break;
  } catch (e) {
    // Try next path
  }
}

if (!sharedLib) {
  throw new Error('execution-receipt.js: Cannot resolve shared library from opspal-core. Ensure opspal-core plugin is installed.');
}

module.exports = sharedLib;

// CLI passthrough
if (require.main === module) {
  // Delegate to the core library's CLI
  const coreScript = corePaths.find(p => { try { require.resolve(p); return true; } catch(e) { return false; } });
  if (coreScript) {
    require(coreScript);
  }
}
