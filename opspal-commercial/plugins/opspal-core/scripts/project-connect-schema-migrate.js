#!/usr/bin/env node

/**
 * Project-Connect Schema Migration
 *
 * Migrates project-connected orgs from the old layout (orgs/{slug}/repo/)
 * to the new symlink-based schema (orgs/{slug}/.repo/ + symlinks).
 *
 * What it does per org:
 *   1. Validates orgs/{slug}/repo/ exists and is a clean git repo
 *   2. Detects the repo's internal content path (orgs/{slug}/ or root)
 *   3. Moves repo/ → .repo/
 *   4. Creates symlinks from org root to content inside .repo/
 *   5. Writes .sync-manifest.json with mapping metadata
 *   6. Backs up and updates _meta/org.yaml
 *   7. Installs git hooks in .repo/.git/hooks/
 *   8. Updates project-connect registry JSON
 *
 * Usage:
 *   node project-connect-schema-migrate.js --org peregrine [--dry-run]
 *   node project-connect-schema-migrate.js --all [--dry-run]
 *   node project-connect-schema-migrate.js --workspace /path/to/workspace --all
 *
 * Idempotent: Safe to re-run. Skips existing valid symlinks. Detects
 * already-migrated orgs (.repo/ exists, repo/ doesn't).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Directories that are workspace-only and should NOT be symlinked
const WORKSPACE_ONLY_DIRS = new Set(['_meta', 'configs', '.sync-manifest.json']);

// Files that are workspace-generated and should not be symlinked
const WORKSPACE_ONLY_FILES = new Set(['PROJECT_CONNECT_SUMMARY.md']);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { org: null, all: false, dryRun: false, workspace: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--org') opts.org = args[++i];
    if (args[i] === '--all') opts.all = true;
    if (args[i] === '--dry-run') opts.dryRun = true;
    if (args[i] === '--workspace') opts.workspace = args[++i];
  }
  return opts;
}

/**
 * Resolve the workspace root directory.
 * Tries: --workspace arg, $PWD (if it has orgs/), git toplevel, known path.
 */
function resolveWorkspaceRoot(explicitPath) {
  if (explicitPath && fs.existsSync(path.join(explicitPath, 'orgs'))) {
    return path.resolve(explicitPath);
  }

  // $PWD with orgs/
  if (fs.existsSync(path.join(process.cwd(), 'orgs'))) {
    return process.cwd();
  }

  // git toplevel
  try {
    const toplevel = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', timeout: 5000 }).trim();
    if (fs.existsSync(path.join(toplevel, 'orgs'))) return toplevel;
  } catch { /* not in a git repo */ }

  return null;
}

/**
 * Resolve the path to git hook templates.
 * Lives alongside this script at templates/git-hooks/
 */
function resolveHookTemplateDir() {
  return path.join(__dirname, 'templates', 'git-hooks');
}

function log(msg) { console.log(`  ${msg}`); }
function logOk(msg) { console.log(`  OK   ${msg}`); }
function logWarn(msg) { console.log(`  WARN ${msg}`); }
function logErr(msg) { console.error(`  ERR  ${msg}`); }
function logDry(msg) { console.log(`  DRY  ${msg}`); }

/**
 * Scan orgs/ for all orgs that have repo/ or .repo/ directories
 */
function findMigratableOrgs(workspaceRoot) {
  const orgsDir = path.join(workspaceRoot, 'orgs');
  if (!fs.existsSync(orgsDir)) return { needsMigration: [], alreadyMigrated: [], notConnected: [] };

  const needsMigration = [];
  const alreadyMigrated = [];
  const notConnected = [];

  for (const slug of fs.readdirSync(orgsDir)) {
    const orgDir = path.join(orgsDir, slug);
    if (!fs.statSync(orgDir).isDirectory()) continue;

    const hasOldRepo = fs.existsSync(path.join(orgDir, 'repo', '.git'));
    const hasNewRepo = fs.existsSync(path.join(orgDir, '.repo', '.git'));

    if (hasOldRepo && !hasNewRepo) {
      needsMigration.push(slug);
    } else if (hasNewRepo) {
      alreadyMigrated.push(slug);
    } else {
      notConnected.push(slug);
    }
  }

  return { needsMigration, alreadyMigrated, notConnected };
}

function detectContentRoot(repoDir, slug) {
  const nested = path.join(repoDir, 'orgs', slug);
  if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
    return { contentRoot: nested, relativePath: `orgs/${slug}` };
  }

  const platformsAtRoot = path.join(repoDir, 'platforms');
  if (fs.existsSync(platformsAtRoot) && fs.statSync(platformsAtRoot).isDirectory()) {
    return { contentRoot: repoDir, relativePath: '.' };
  }

  return { contentRoot: repoDir, relativePath: '.' };
}

function listContentItems(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => !name.startsWith('.'));
}

function isGitClean(repoDir) {
  try {
    const out = execSync('git status --porcelain', { cwd: repoDir, encoding: 'utf8' }).trim();
    return out === '';
  } catch {
    return false;
  }
}

function findRegistryFile(repoDir, customerId) {
  const pcDir = path.join(repoDir, 'project-connect');
  if (!fs.existsSync(pcDir)) return null;

  const files = fs.readdirSync(pcDir);
  const match = files.find(f => f.endsWith('.json') && f.includes(customerId));
  if (match) return path.join(pcDir, match);

  const anyJson = files.find(f => f.endsWith('.json') && !f.startsWith('.'));
  return anyJson ? path.join(pcDir, anyJson) : null;
}

function installGitHooks(repoDir, dryRun) {
  const hooksDir = path.join(repoDir, '.git', 'hooks');
  const templateDir = resolveHookTemplateDir();

  if (!fs.existsSync(templateDir)) {
    logWarn('Hook templates directory not found, skipping hook installation');
    return [];
  }

  const installed = [];
  for (const hookName of fs.readdirSync(templateDir)) {
    const src = path.join(templateDir, hookName);
    const dest = path.join(hooksDir, hookName);

    if (fs.statSync(src).isFile() === false) continue;
    if (fs.existsSync(dest) && !dest.endsWith('.sample')) {
      logWarn(`Hook ${hookName} already exists, skipping`);
      continue;
    }

    if (dryRun) {
      logDry(`Would install hook: ${hookName}`);
    } else {
      fs.copyFileSync(src, dest);
      fs.chmodSync(dest, 0o755);
      logOk(`Installed hook: ${hookName}`);
    }
    installed.push(hookName);
  }

  return installed;
}

// ─── Symlink Setup (reusable by syncDown) ─────────────────────────────

/**
 * Create symlinks from orgDir to content inside .repo/.
 * Exported for use by project-connect.js syncDown().
 *
 * @param {string} orgDir - Absolute path to orgs/{slug}/
 * @param {string} slug - Org slug
 * @param {object} opts - { dryRun }
 * @returns {{ symlinks, skipped }}
 */
function setupSymlinks(orgDir, slug, opts = {}) {
  const { dryRun = false } = opts;
  const repoDir = path.join(orgDir, '.repo');

  if (!fs.existsSync(repoDir)) {
    return { symlinks: [], skipped: [] };
  }

  const { contentRoot, relativePath } = detectContentRoot(repoDir, slug);
  const items = listContentItems(contentRoot);
  const symlinks = [];
  const skipped = [];

  for (const item of items) {
    if (WORKSPACE_ONLY_DIRS.has(item) || WORKSPACE_ONLY_FILES.has(item)) {
      skipped.push({ name: item, reason: 'workspace-only' });
      continue;
    }

    const linkPath = path.join(orgDir, item);
    const targetRelative = path.join('.repo', relativePath, item);

    if (fs.existsSync(linkPath)) {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        const existing = fs.readlinkSync(linkPath);
        if (existing === targetRelative) {
          skipped.push({ name: item, reason: 'symlink already correct' });
          continue;
        }
        if (!dryRun) fs.unlinkSync(linkPath);
      } else {
        skipped.push({ name: item, reason: 'real file/dir exists' });
        continue;
      }
    }

    if (!dryRun) {
      fs.symlinkSync(targetRelative, linkPath);
    }
    symlinks.push({ name: item, target: targetRelative });
  }

  // Write .sync-manifest.json
  const manifestPath = path.join(orgDir, '.sync-manifest.json');
  if (!dryRun) {
    const manifest = {
      version: '1.0.0',
      orgSlug: slug,
      repoPath: '.repo',
      contentRoot: relativePath,
      symlinks: symlinks.map(s => ({ name: s.name, target: s.target })),
      skipped: skipped.map(s => ({ name: s.name, reason: s.reason })),
      migratedAt: new Date().toISOString(),
      syncConfig: { autoPull: true, autoPush: false, pullStrategy: 'ff-only' }
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  // Install git hooks
  installGitHooks(repoDir, dryRun);

  return { symlinks, skipped, contentRoot: relativePath };
}

// ─── Per-org migration ────────────────────────────────────────────────

function migrateOrg(workspaceRoot, slug, dryRun) {
  const orgDir = path.join(workspaceRoot, 'orgs', slug);
  const oldRepoDir = path.join(orgDir, 'repo');
  const newRepoDir = path.join(orgDir, '.repo');

  console.log(`\n--- ${slug} ---`);
  console.log(`  Org Dir:  ${orgDir}`);
  console.log(`  Dry Run:  ${dryRun}\n`);

  // Step 1: Validate
  console.log(`Step 1: Validate current state`);

  if (!fs.existsSync(orgDir)) {
    logErr(`Org directory not found: ${orgDir}`);
    return { success: false, slug, symlinksCreated: 0, error: 'org dir not found' };
  }

  if (fs.existsSync(newRepoDir) && !fs.existsSync(oldRepoDir)) {
    logOk(`Already migrated (.repo/ exists, repo/ gone)`);
    log(`Re-running symlink check and hook installation...\n`);
  } else if (!fs.existsSync(oldRepoDir)) {
    logErr(`Neither repo/ nor .repo/ found in ${orgDir}`);
    return { success: false, slug, symlinksCreated: 0, error: 'no repo found' };
  } else {
    if (!fs.existsSync(path.join(oldRepoDir, '.git'))) {
      logErr(`${oldRepoDir} is not a git repository`);
      return { success: false, slug, symlinksCreated: 0, error: 'not a git repo' };
    }
    if (!isGitClean(oldRepoDir)) {
      logErr(`Git working tree is dirty. Commit or stash changes first.`);
      return { success: false, slug, symlinksCreated: 0, error: 'dirty working tree' };
    }
    logOk(`Validated: clean git repo`);
  }

  // Step 2: Move repo/ → .repo/
  console.log(`\nStep 2: Move repo/ → .repo/`);

  if (fs.existsSync(newRepoDir)) {
    logOk(`.repo/ already exists, skipping move`);
  } else if (fs.existsSync(oldRepoDir)) {
    if (dryRun) {
      logDry(`Would move repo/ → .repo/`);
    } else {
      fs.renameSync(oldRepoDir, newRepoDir);
      logOk(`Moved repo/ → .repo/`);
    }
  }

  const repoDir = fs.existsSync(newRepoDir) ? newRepoDir : oldRepoDir;
  const { contentRoot, relativePath } = detectContentRoot(repoDir, slug);

  // Step 3-5: Symlinks + manifest + hooks
  console.log(`\nStep 3: Detect content root`);
  logOk(`Content root: ${relativePath}`);

  console.log(`\nStep 4: Create symlinks`);
  const { symlinks, skipped } = setupSymlinks(orgDir, slug, { dryRun });

  for (const s of symlinks) {
    if (dryRun) logDry(`Would create symlink: ${s.name} → ${s.target}`);
    else logOk(`Symlink: ${s.name} → ${s.target}`);
  }
  if (skipped.length > 0) {
    log(`Skipped ${skipped.length} item(s): ${skipped.map(s => s.name).join(', ')}`);
  }

  console.log(`\nStep 5: Write .sync-manifest.json`);
  if (dryRun) logDry(`Would write .sync-manifest.json (${symlinks.length} symlinks)`);
  else logOk(`Wrote .sync-manifest.json`);

  // Step 6: Update _meta/org.yaml
  console.log(`\nStep 6: Update _meta/org.yaml`);

  const orgYamlPath = path.join(orgDir, '_meta', 'org.yaml');
  if (fs.existsSync(orgYamlPath)) {
    const orgYaml = fs.readFileSync(orgYamlPath, 'utf8');

    if (orgYaml.includes('local_path: repo/') || orgYaml.includes("local_path: 'repo/'")) {
      if (dryRun) {
        logDry(`Would update org.yaml: local_path → .repo/`);
      } else {
        fs.copyFileSync(orgYamlPath, orgYamlPath + '.bak');
        logOk(`Backed up org.yaml → org.yaml.bak`);
        const updated = orgYaml.replace(/local_path:\s*['"]?repo\/?['"]?/, 'local_path: .repo/');
        fs.writeFileSync(orgYamlPath, updated);
        logOk(`Updated local_path to .repo/`);
      }
    } else if (orgYaml.includes('local_path: .repo/')) {
      logOk(`org.yaml already points to .repo/`);
    } else {
      logWarn(`local_path not found in org.yaml`);
    }
  } else {
    logWarn(`No _meta/org.yaml found`);
  }

  // Step 7: Hooks (already installed by setupSymlinks)
  console.log(`\nStep 7: Install git hooks`);
  log(`Handled by symlink setup`);

  // Step 8: Update project-connect registry
  console.log(`\nStep 8: Update project-connect registry`);

  let customerId = null;
  if (fs.existsSync(orgYamlPath)) {
    const yaml = fs.readFileSync(orgYamlPath, 'utf8');
    const match = yaml.match(/customer_id:\s*(\S+)/);
    if (match) customerId = match[1];
  }

  if (customerId) {
    const registryFile = findRegistryFile(repoDir, customerId);
    if (registryFile) {
      try {
        const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
        if (registry.resources?.supabase?.entry?.local_paths) {
          registry.resources.supabase.entry.local_paths.org_directory = `orgs/${slug}`;
        }
        if (registry.supabase_entry?.local_paths) {
          registry.supabase_entry.local_paths.org_directory = `orgs/${slug}`;
        }
        registry.schemaMigration = {
          version: '1.0.0',
          migratedAt: new Date().toISOString(),
          layout: 'symlink',
          repoPath: '.repo',
          contentRoot: relativePath
        };
        if (dryRun) {
          logDry(`Would update registry: ${path.basename(registryFile)}`);
        } else {
          fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2) + '\n');
          logOk(`Updated registry: ${path.basename(registryFile)}`);
        }
      } catch (err) {
        logWarn(`Could not update registry: ${err.message}`);
      }
    } else {
      logWarn(`No registry file found for ${customerId}`);
    }
  } else {
    logWarn(`No customer_id in org.yaml, skipping registry update`);
  }

  return { success: true, slug, symlinksCreated: symlinks.length, skipped: skipped.length, hooks: 0 };
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (!opts.org && !opts.all) {
    console.log(`
Usage:
  node project-connect-schema-migrate.js --org <slug> [--dry-run] [--workspace /path]
  node project-connect-schema-migrate.js --all [--dry-run] [--workspace /path]

Options:
  --org <slug>       Migrate a single org
  --all              Scan and migrate all orgs that need it (+ re-validate already-migrated)
  --dry-run          Show what would happen without making changes
  --workspace <path> Explicit workspace root (default: auto-detect from $PWD)
`);
    process.exit(1);
  }

  const workspaceRoot = resolveWorkspaceRoot(opts.workspace);
  if (!workspaceRoot) {
    console.error('Could not find workspace root (no orgs/ directory found).');
    console.error('Run from your workspace directory or use --workspace /path/to/workspace');
    process.exit(1);
  }

  console.log(`\nProject-Connect Schema Migration`);
  console.log(`================================`);
  console.log(`  Workspace: ${workspaceRoot}`);

  if (opts.all) {
    const { needsMigration, alreadyMigrated, notConnected } = findMigratableOrgs(workspaceRoot);

    console.log(`\nScan results:`);
    console.log(`  Needs migration:   ${needsMigration.length > 0 ? needsMigration.join(', ') : '(none)'}`);
    console.log(`  Already migrated:  ${alreadyMigrated.length > 0 ? alreadyMigrated.join(', ') : '(none)'}`);
    console.log(`  Not connected:     ${notConnected.length > 0 ? notConnected.join(', ') : '(none)'}`);

    const toProcess = [...needsMigration, ...alreadyMigrated];

    if (toProcess.length === 0) {
      console.log(`\nNo orgs to migrate or re-validate.`);
      process.exit(0);
    }

    const results = [];
    for (const slug of toProcess) {
      results.push(migrateOrg(workspaceRoot, slug, opts.dryRun));
    }

    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\n================================`);
    console.log(`Batch Migration ${opts.dryRun ? '(DRY RUN) ' : ''}Summary`);
    console.log(`================================`);
    console.log(`  Total processed: ${results.length}`);
    console.log(`  Succeeded:       ${succeeded.length}`);
    if (failed.length > 0) {
      console.log(`  Failed:          ${failed.length}`);
      for (const f of failed) console.log(`    - ${f.slug}: ${f.error}`);
    }
    console.log();

  } else {
    const result = migrateOrg(workspaceRoot, opts.org, opts.dryRun);

    console.log(`\n================================`);
    console.log(`Migration ${opts.dryRun ? '(DRY RUN) ' : ''}${result.success ? 'Complete' : 'FAILED'}`);
    console.log(`================================`);
    console.log(`  Symlinks created: ${result.symlinksCreated}`);
    console.log(`  Items skipped:    ${result.skipped || 0}`);

    if (!opts.dryRun && result.success) {
      console.log(`\nVerification commands:`);
      console.log(`  ls -la orgs/${opts.org}/`);
      console.log(`  cat orgs/${opts.org}/WORK_INDEX.yaml | head -5`);
      console.log(`  cd orgs/${opts.org}/.repo && git status`);
    }

    if (!result.success) process.exit(1);
    console.log();
  }
}

// Export for programmatic use by project-connect.js
module.exports = { setupSymlinks, installGitHooks, resolveHookTemplateDir };

main().catch(err => {
  console.error(`\nFatal error: ${err.message}`);
  process.exit(1);
});
