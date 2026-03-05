#!/usr/bin/env node

/**
 * Runbook Versioner
 *
 * Purpose: Create versioned snapshots of operational runbooks with semantic versioning
 * Usage: node scripts/lib/runbook-versioner.js --org <org-alias> [options]
 *
 * Features:
 * - Semantic versioning (MAJOR.MINOR.PATCH)
 * - Automatic version bump detection
 * - Version index tracking
 * - Timestamped snapshots
 * - Cleanup of old versions (keep last 30)
 * - Workspace and plugin directory detection
 *
 * Version Bump Logic:
 * - MAJOR: Breaking changes (e.g., platform migration, major reorg)
 * - MINOR: New features (new workflows, new objects, new exceptions)
 * - PATCH: Updates (metrics changes, minor edits, same structure)
 *
 * Path Resolution:
 *   Workspace (preferred):
 *     $WORKSPACE_DIR/instances/salesforce/{org}/RUNBOOK.md
 *     $WORKSPACE_DIR/instances/salesforce/{org}/runbook-history/
 *
 *   Plugin (fallback):
 *     {plugin-root}/instances/salesforce/{org}/RUNBOOK.md
 *     {plugin-root}/instances/salesforce/{org}/runbook-history/
 *
 * Environment Variables:
 *   WORKSPACE_DIR - Override workspace base directory (default: /mnt/c/Users/cnace/RevPal/workspace)
 *   CLAUDE_PLUGIN_ROOT - Override plugin root directory (auto-detected if not set)
 *
 * Storage:
 *   instances/salesforce/{org}/runbook-history/
 *   ├── RUNBOOK-v1.0.0-2025-10-20T14:30:00.md
 *   ├── RUNBOOK-v1.1.0-2025-10-20T15:45:00.md
 *   └── VERSION_INDEX.json
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Error
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getInstancePath, resolvePluginRoot } = require('./path-conventions');

/**
 * Semantic version object
 */
class Version {
  constructor(major, minor, patch) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
  }

  toString() {
    return `${this.major}.${this.minor}.${this.patch}`;
  }

  static parse(versionString) {
    const match = versionString.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
      throw new Error(`Invalid version string: ${versionString}`);
    }
    return new Version(
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10)
    );
  }

  bumpMajor() {
    return new Version(this.major + 1, 0, 0);
  }

  bumpMinor() {
    return new Version(this.major, this.minor + 1, 0);
  }

  bumpPatch() {
    return new Version(this.major, this.minor, this.patch + 1);
  }
}

/**
 * Calculate hash of file content
 */
function calculateHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Load version index
 */
function loadVersionIndex(historyDir) {
  const indexPath = path.join(historyDir, 'VERSION_INDEX.json');

  if (!fs.existsSync(indexPath)) {
    return {
      current_version: null,
      versions: []
    };
  }

  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch (err) {
    console.warn(`⚠️  Failed to parse VERSION_INDEX.json: ${err.message}`);
    return {
      current_version: null,
      versions: []
    };
  }
}

/**
 * Save version index
 */
function saveVersionIndex(historyDir, index) {
  const indexPath = path.join(historyDir, 'VERSION_INDEX.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Detect version bump type by comparing content
 */
function detectBumpType(previousContent, currentContent) {
  if (!previousContent) {
    return 'minor'; // First version
  }

  // Extract section counts for comparison
  const extractSections = (content) => {
    const sections = {
      workflows: (content.match(/### .* \(workflow\)/g) || []).length,
      objects: (content.match(/### .* \(object\)/g) || []).length,
      exceptions: (content.match(/### .* \(exception\)/g) || []).length,
      integrations: (content.match(/### .* \(integration\)/g) || []).length
    };
    return sections;
  };

  const prevSections = extractSections(previousContent);
  const currSections = extractSections(currentContent);

  // Check for major structural changes
  const hasBreakingChange = (
    Math.abs(prevSections.workflows - currSections.workflows) > 5 ||
    Math.abs(prevSections.objects - currSections.objects) > 10
  );

  if (hasBreakingChange) {
    return 'major';
  }

  // Check for new features
  const hasNewFeatures = (
    currSections.workflows > prevSections.workflows ||
    currSections.objects > prevSections.objects ||
    currSections.exceptions > prevSections.exceptions
  );

  if (hasNewFeatures) {
    return 'minor';
  }

  // Default to patch for minor updates
  return 'patch';
}

/**
 * Create versioned snapshot
 */
function createSnapshot(org, runbookPath, options = {}) {
  const pluginRoot = resolvePluginRoot(__dirname);

  // Check workspace directory first (preferred location)
  const workspaceBase = process.env.WORKSPACE_DIR || '/mnt/c/Users/cnace/RevPal/workspace';
  const workspaceHistoryDir = path.join(workspaceBase, 'instances', 'salesforce', org, 'runbook-history');

  // Fallback to plugin directory using path-conventions
  const pluginHistoryDir = path.join(getInstancePath('salesforce', org, null, pluginRoot), 'runbook-history');

  // Use workspace if runbook is in workspace, otherwise use plugin directory
  const runbookDir = path.dirname(runbookPath);
  const isInWorkspace = runbookDir.includes('workspace');
  const historyDir = isInWorkspace ? workspaceHistoryDir : pluginHistoryDir;

  // Ensure history directory exists
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  // Load current runbook
  if (!fs.existsSync(runbookPath)) {
    throw new Error(`Runbook not found: ${runbookPath}`);
  }

  const currentContent = fs.readFileSync(runbookPath, 'utf-8');
  const currentHash = calculateHash(currentContent);

  // Load version index
  const index = loadVersionIndex(historyDir);

  // Check if content has changed
  if (index.current_version) {
    const lastVersion = index.versions.find(v => v.version === index.current_version);
    if (lastVersion && lastVersion.hash === currentHash) {
      if (!options.force) {
        return {
          action: 'skipped',
          reason: 'No changes detected',
          version: index.current_version
        };
      }
    }
  }

  // Determine new version
  let newVersion;
  if (options.version) {
    // Manual version specified
    newVersion = Version.parse(options.version);
  } else if (index.current_version) {
    // Auto-detect bump type
    const previousVersion = index.versions.find(v => v.version === index.current_version);
    const previousContent = previousVersion ? fs.readFileSync(
      path.join(historyDir, previousVersion.filename),
      'utf-8'
    ) : null;

    const bumpType = options.bumpType || detectBumpType(previousContent, currentContent);
    const currentVersion = Version.parse(index.current_version);

    switch (bumpType) {
      case 'major':
        newVersion = currentVersion.bumpMajor();
        break;
      case 'minor':
        newVersion = currentVersion.bumpMinor();
        break;
      case 'patch':
      default:
        newVersion = currentVersion.bumpPatch();
        break;
    }
  } else {
    // First version
    newVersion = new Version(1, 0, 0);
  }

  // Create snapshot filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const filename = `RUNBOOK-v${newVersion.toString()}-${timestamp}.md`;
  const snapshotPath = path.join(historyDir, filename);

  // Copy runbook to snapshot
  fs.copyFileSync(runbookPath, snapshotPath);

  // Update version index
  const versionEntry = {
    version: `v${newVersion.toString()}`,
    filename: filename,
    timestamp: new Date().toISOString(),
    hash: currentHash,
    size: fs.statSync(snapshotPath).size,
    notes: options.notes || null
  };

  index.versions.push(versionEntry);
  index.current_version = versionEntry.version;

  // Cleanup old versions (keep last 30)
  if (index.versions.length > 30) {
    const toRemove = index.versions.slice(0, index.versions.length - 30);
    toRemove.forEach(v => {
      const oldPath = path.join(historyDir, v.filename);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    });
    index.versions = index.versions.slice(-30);
  }

  // Save updated index
  saveVersionIndex(historyDir, index);

  return {
    action: 'created',
    version: versionEntry.version,
    filename: filename,
    path: snapshotPath,
    previousVersion: index.versions.length > 1 ? index.versions[index.versions.length - 2].version : null
  };
}

/**
 * List all versions
 */
function listVersions(org) {
  const pluginRoot = path.resolve(__dirname, '../..');
  const historyDir = path.join(pluginRoot, 'instances', org, 'runbook-history');

  if (!fs.existsSync(historyDir)) {
    return {
      current_version: null,
      versions: []
    };
  }

  return loadVersionIndex(historyDir);
}

/**
 * Get specific version path
 */
function getVersionPath(org, version) {
  const pluginRoot = path.resolve(__dirname, '../..');
  const historyDir = path.join(pluginRoot, 'instances', org, 'runbook-history');
  const index = loadVersionIndex(historyDir);

  const versionEntry = index.versions.find(v => v.version === version);
  if (!versionEntry) {
    return null;
  }

  return path.join(historyDir, versionEntry.filename);
}

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    org: null,
    action: 'snapshot', // snapshot, list, get
    version: null,
    bumpType: null,
    notes: null,
    force: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--org':
        options.org = next;
        i++;
        break;
      case '--action':
        options.action = next;
        i++;
        break;
      case '--version':
        options.version = next;
        i++;
        break;
      case '--bump':
        options.bumpType = next; // major, minor, patch
        i++;
        break;
      case '--notes':
        options.notes = next;
        i++;
        break;
      case '--force':
        options.force = true;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`❌ Unknown option: ${arg}`);
          printUsage();
          process.exit(1);
        }
    }
  }

  return options;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Usage: runbook-versioner.js --org <org-alias> [options]');
  console.log('');
  console.log('Actions:');
  console.log('  --action snapshot      Create versioned snapshot (default)');
  console.log('  --action list          List all versions');
  console.log('  --action get           Get path to specific version');
  console.log('');
  console.log('Snapshot Options:');
  console.log('  --bump <type>          Version bump: major, minor, patch (auto-detect if not specified)');
  console.log('  --version <ver>        Explicit version (e.g., 2.0.0)');
  console.log('  --notes <text>         Version notes');
  console.log('  --force                Create snapshot even if no changes');
  console.log('');
  console.log('Get Options:');
  console.log('  --version <ver>        Version to retrieve (e.g., v1.2.0)');
  console.log('');
  console.log('Examples:');
  console.log('  # Create snapshot with auto-detection');
  console.log('  node runbook-versioner.js --org rentable-sandbox');
  console.log('');
  console.log('  # Create minor version bump');
  console.log('  node runbook-versioner.js --org rentable-sandbox --bump minor');
  console.log('');
  console.log('  # List versions');
  console.log('  node runbook-versioner.js --org rentable-sandbox --action list');
  console.log('');
  console.log('  # Get specific version path');
  console.log('  node runbook-versioner.js --org rentable-sandbox --action get --version v1.2.0');
}

/**
 * Main execution
 */
async function main() {
  // Debug logging to identify unknown callers (if DEBUG_RUNBOOK_VERSIONER is set)
  if (process.env.DEBUG_RUNBOOK_VERSIONER) {
    console.error('[DEBUG] runbook-versioner called with:');
    console.error('[DEBUG]   argv:', process.argv);
    console.error('[DEBUG]   cwd:', process.cwd());
    console.error('[DEBUG]   CLAUDE_PLUGIN_ROOT:', process.env.CLAUDE_PLUGIN_ROOT);
    console.error('[DEBUG]   WORKSPACE_DIR:', process.env.WORKSPACE_DIR);
  }

  const options = parseArgs();

  if (!options.org) {
    console.error('❌ Missing required argument: --org');
    printUsage();
    process.exit(1);
  }

  const pluginRoot = resolvePluginRoot(__dirname);

  // Check workspace directory first (preferred location per user)
  const workspaceBase = process.env.WORKSPACE_DIR || '/mnt/c/Users/cnace/RevPal/workspace';
  const workspacePath = path.join(workspaceBase, 'instances', 'salesforce', options.org, 'RUNBOOK.md');

  // Fallback to plugin directory using path-conventions
  const pluginPath = path.join(getInstancePath('salesforce', options.org, null, pluginRoot), 'RUNBOOK.md');

  // Use whichever exists (prefer workspace)
  let runbookPath;
  if (fs.existsSync(workspacePath)) {
    runbookPath = workspacePath;
  } else if (fs.existsSync(pluginPath)) {
    runbookPath = pluginPath;
  } else {
    // Neither exists - provide helpful error message
    console.error('❌ Runbook not found in either location:');
    console.error(`   Workspace: ${workspacePath}`);
    console.error(`   Plugin:    ${pluginPath}`);
    console.error('');
    console.error('💡 Generate a runbook first with: /generate-runbook');
    process.exit(1);
  }

  try {
    switch (options.action) {
      case 'snapshot': {
        console.log(`📸 Creating versioned snapshot for: ${options.org}`);
        console.log('');

        const result = createSnapshot(options.org, runbookPath, {
          version: options.version,
          bumpType: options.bumpType,
          notes: options.notes,
          force: options.force
        });

        if (result.action === 'skipped') {
          console.log('⏭️  Snapshot skipped');
          console.log(`   ${result.reason}`);
          console.log(`   Current version: ${result.version}`);
          console.log('');
          console.log('💡 Use --force to create snapshot anyway');
        } else {
          console.log('✅ Snapshot created');
          console.log(`   Version: ${result.version}`);
          if (result.previousVersion) {
            console.log(`   Previous: ${result.previousVersion}`);
          }
          console.log(`   File: ${result.filename}`);
          console.log('');
          console.log(`📁 Saved to: ${result.path}`);
        }
        break;
      }

      case 'list': {
        console.log(`📚 Version History: ${options.org}`);
        console.log('');

        const index = listVersions(options.org);

        if (index.versions.length === 0) {
          console.log('⚠️  No versions found');
          console.log('   Create first snapshot with: node runbook-versioner.js --org {org}');
          break;
        }

        console.log(`Current Version: ${index.current_version}`);
        console.log('');
        console.log('Version History:');
        console.log('─'.repeat(80));

        index.versions.slice().reverse().forEach((v, idx) => {
          const date = new Date(v.timestamp).toLocaleString();
          const size = (v.size / 1024).toFixed(1);
          const current = v.version === index.current_version ? ' (current)' : '';
          console.log(`${v.version}${current}`);
          console.log(`  Date: ${date}`);
          console.log(`  Size: ${size} KB`);
          if (v.notes) {
            console.log(`  Notes: ${v.notes}`);
          }
          if (idx < index.versions.length - 1) {
            console.log('');
          }
        });
        break;
      }

      case 'get': {
        if (!options.version) {
          console.error('❌ Missing required argument: --version');
          printUsage();
          process.exit(1);
        }

        const versionPath = getVersionPath(options.org, options.version);

        if (!versionPath) {
          console.error(`❌ Version not found: ${options.version}`);
          console.log('');
          console.log('Available versions:');
          const index = listVersions(options.org);
          index.versions.forEach(v => console.log(`  - ${v.version}`));
          process.exit(1);
        }

        console.log(versionPath);
        break;
      }

      default:
        console.error(`❌ Unknown action: ${options.action}`);
        printUsage();
        process.exit(1);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.stack) {
      console.error('   Stack:', err.stack);
    }
    process.exit(1);
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

// Export for use as module
module.exports = {
  Version,
  createSnapshot,
  listVersions,
  getVersionPath,
  loadVersionIndex,
  detectBumpType
};
