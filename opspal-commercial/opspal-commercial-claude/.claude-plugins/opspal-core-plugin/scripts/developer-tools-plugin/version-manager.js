#!/usr/bin/env node

/**
 * Version Manager CLI
 *
 * Command-line interface for plugin version management, release preparation,
 * git tagging, and marketplace updates. Uses the plugin-publisher.js library
 * for all version operations.
 *
 * Usage:
 *   node version-manager.js --plugin <name> --bump <major|minor|patch>
 *   node version-manager.js --plugin <name> --version <version>
 *   node version-manager.js --plugin <name> --prerelease <alpha.1|beta.1|rc.1>
 *   node version-manager.js --plugin <name> --rollback <tag>
 *
 * Examples:
 *   node version-manager.js --plugin my-plugin --bump patch --message "Bug fixes"
 *   node version-manager.js --plugin my-plugin --bump minor --message "New features"
 *   node version-manager.js --plugin my-plugin --bump major --message "Breaking changes"
 *   node version-manager.js --plugin my-plugin --prerelease beta.1
 *   node version-manager.js --plugin my-plugin --rollback v1.2.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  parseVersion,
  isValidVersion,
  compareVersions,
  bumpVersion,
  addPrerelease,
  promotePrerelease,
  generateChangelogEntry,
  updatePluginJson,
  updateChangelog
} = require('./lib/plugin-publisher.js');

class VersionManager {
  constructor(options = {}) {
    this.options = options;
    this.marketplaceRoot = path.join(__dirname, '../../..');
    this.pluginsDir = path.join(this.marketplaceRoot, '.claude-plugins');
    this.marketplaceJsonPath = path.join(this.marketplaceRoot, '.claude-plugin', 'marketplace.json');

    this.changes = {
      files: [],
      commits: [],
      rollback: []
    };
  }

  /**
   * Main execution flow
   */
  async execute(pluginName, action) {
    try {
      const pluginDir = path.join(this.pluginsDir, pluginName);

      if (!fs.existsSync(pluginDir)) {
        throw new Error(`Plugin not found: ${pluginName}`);
      }

      // Get current version
      const currentVersion = this.getCurrentVersion(pluginDir);
      console.log(`Current version: ${currentVersion}`);

      let newVersion;

      // Determine action using library functions
      if (action.bump) {
        newVersion = bumpVersion(currentVersion, action.bump);
      } else if (action.version) {
        newVersion = action.version;
      } else if (action.prerelease) {
        newVersion = addPrerelease(currentVersion, action.prerelease);
      } else if (action.promote) {
        newVersion = promotePrerelease(currentVersion);
      } else if (action.rollback) {
        return await this.rollback(pluginName, action.rollback);
      } else {
        throw new Error('No action specified. Use --bump, --version, --prerelease, --promote, or --rollback');
      }

      // Validate new version using library
      if (!isValidVersion(newVersion)) {
        throw new Error(`Invalid version format: ${newVersion}. Must be MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`);
      }
      this.validateSequence(currentVersion, newVersion);

      console.log(`New version: ${newVersion}`);

      // Dry run check
      if (this.options.dryRun) {
        console.log('\n🏃 DRY RUN - No changes will be made\n');
        this.previewChanges(pluginDir, currentVersion, newVersion);
        return { dryRun: true, currentVersion, newVersion };
      }

      // Execute version update
      const result = await this.updateVersion(pluginDir, pluginName, currentVersion, newVersion, action);

      // Quality Gate: Validate version update completed successfully
      if (!result || !result.updated || result.updated.length === 0) {
        throw new Error('Version update failed: No files were updated');
      }

      console.log('\n✅ Version update complete!');
      console.log(`   ${currentVersion} → ${newVersion}`);

      return result;
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      if (this.changes.rollback.length > 0 && !this.options.noRollback) {
        console.log('\n🔄 Rolling back changes...');
        this.performRollback();
      }
      throw error;
    }
  }

  /**
   * Get current version from plugin.json
   */
  getCurrentVersion(pluginDir) {
    const pluginJsonPath = this.findPluginJson(pluginDir);
    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    return pluginJson.version || '0.0.0';
  }

  /**
   * Find plugin.json (could be in .claude-plugin/ or root)
   */
  findPluginJson(pluginDir) {
    const claudePluginPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
    const rootPath = path.join(pluginDir, 'plugin.json');

    if (fs.existsSync(claudePluginPath)) {
      return claudePluginPath;
    } else if (fs.existsSync(rootPath)) {
      return rootPath;
    } else {
      throw new Error('plugin.json not found');
    }
  }

  /**
   * Validate version sequence (new > old) using library
   */
  validateSequence(oldVersion, newVersion) {
    const comparison = compareVersions(oldVersion, newVersion);

    if (comparison >= 0 && !this.options.force) {
      throw new Error(`Version ${newVersion} is not greater than current ${oldVersion}. Use --force to override.`);
    }
  }

  /**
   * Update version across all files using library functions
   */
  async updateVersion(pluginDir, pluginName, oldVersion, newVersion, action) {
    const updates = [];

    // 1. Update plugin.json using library
    const pluginJsonPath = this.findPluginJson(pluginDir);
    const oldPluginJson = fs.readFileSync(pluginJsonPath, 'utf8');

    updatePluginJson(pluginJsonPath, newVersion);
    this.changes.files.push({ path: pluginJsonPath, old: oldPluginJson, new: fs.readFileSync(pluginJsonPath, 'utf8') });
    updates.push(`Updated ${path.relative(this.marketplaceRoot, pluginJsonPath)}`);

    // 2. Update marketplace.json
    if (fs.existsSync(this.marketplaceJsonPath)) {
      const marketplace = JSON.parse(fs.readFileSync(this.marketplaceJsonPath, 'utf8'));
      const oldMarketplace = JSON.stringify(marketplace, null, 2);

      const plugin = marketplace.plugins.find(p => p.name === pluginName);
      if (plugin) {
        plugin.version = newVersion;
        fs.writeFileSync(this.marketplaceJsonPath, JSON.stringify(marketplace, null, 2) + '\n', 'utf8');

        this.changes.files.push({ path: this.marketplaceJsonPath, old: oldMarketplace, new: JSON.stringify(marketplace, null, 2) });
        updates.push(`Updated marketplace.json`);
      }
    }

    // 3. Update CHANGELOG.md using library
    const changelogPath = path.join(pluginDir, 'CHANGELOG.md');
    if (action.changelog !== false) {
      const oldChangelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
      const date = new Date().toISOString().split('T')[0];

      // Prepare changes for changelog
      const changes = action.message ? action.message : null;

      updateChangelog(changelogPath, newVersion, date, changes);
      this.changes.files.push({ path: changelogPath, old: oldChangelog, new: fs.readFileSync(changelogPath, 'utf8') });
      updates.push(`Updated CHANGELOG.md`);
    }

    // 4. Update README.md version references if exists
    const readmePath = path.join(pluginDir, 'README.md');
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, 'utf8');
      const oldReadme = readme;

      // Update version badge or footer
      const updatedReadme = readme
        .replace(new RegExp(`v${oldVersion.replace(/\./g, '\\.')}`, 'g'), `v${newVersion}`)
        .replace(new RegExp(`${oldVersion.replace(/\./g, '\\.')}(?!\\.)`, 'g'), newVersion);

      if (updatedReadme !== oldReadme) {
        fs.writeFileSync(readmePath, updatedReadme, 'utf8');
        this.changes.files.push({ path: readmePath, old: oldReadme, new: updatedReadme });
        updates.push(`Updated README.md`);
      }
    }

    // 5. Git operations (if enabled)
    if (!this.options.noGit) {
      const gitUpdates = this.performGitOperations(pluginName, newVersion, action.message);
      updates.push(...gitUpdates);
    }

    return {
      success: true,
      oldVersion,
      newVersion,
      updates,
      files: this.changes.files.map(f => f.path)
    };
  }


  /**
   * Perform git operations
   */
  performGitOperations(pluginName, version, message) {
    const updates = [];

    try {
      // Stage changes
      execSync('git add .', { cwd: this.marketplaceRoot, stdio: 'pipe' });
      updates.push('Staged changes');

      // Create commit
      const commitMessage = message || `chore: Release ${pluginName} v${version}`;
      execSync(`git commit -m "${commitMessage}"`, { cwd: this.marketplaceRoot, stdio: 'pipe' });
      updates.push(`Created commit: ${commitMessage}`);
      this.changes.commits.push(commitMessage);

      // Create tag
      const tag = `v${version}`;
      const tagMessage = `Release ${pluginName} ${version}`;
      execSync(`git tag -a ${tag} -m "${tagMessage}"`, { cwd: this.marketplaceRoot, stdio: 'pipe' });
      updates.push(`Created tag: ${tag}`);
      this.changes.rollback.push({ type: 'tag', value: tag });

      // Push if requested
      if (this.options.push) {
        execSync('git push origin main', { cwd: this.marketplaceRoot, stdio: 'pipe' });
        execSync('git push origin --tags', { cwd: this.marketplaceRoot, stdio: 'pipe' });
        updates.push('Pushed to remote');
      }
    } catch (error) {
      console.warn('⚠️  Git operations failed:', error.message);
      console.log('   Files have been updated but not committed.');
    }

    return updates;
  }

  /**
   * Preview changes without applying
   */
  previewChanges(pluginDir, oldVersion, newVersion) {
    console.log('Changes that would be made:\n');

    console.log(`1. plugin.json`);
    console.log(`   version: "${oldVersion}" → "${newVersion}"\n`);

    console.log(`2. marketplace.json`);
    console.log(`   plugins[].version: "${oldVersion}" → "${newVersion}"\n`);

    const changelogPath = path.join(pluginDir, 'CHANGELOG.md');
    if (fs.existsSync(changelogPath)) {
      console.log(`3. CHANGELOG.md`);
      console.log(`   Add entry for [${newVersion}]\n`);
    }

    const readmePath = path.join(pluginDir, 'README.md');
    if (fs.existsSync(readmePath)) {
      console.log(`4. README.md`);
      console.log(`   Update version references\n`);
    }

    if (!this.options.noGit) {
      console.log(`5. Git operations`);
      console.log(`   - Stage changes`);
      console.log(`   - Commit: "chore: Release v${newVersion}"`);
      console.log(`   - Tag: v${newVersion}`);
      if (this.options.push) {
        console.log(`   - Push to remote`);
      }
    }
  }

  /**
   * Rollback to previous version
   */
  async rollback(pluginName, tag) {
    console.log(`Rolling back to ${tag}...`);

    try {
      // Get version from tag
      const version = tag.replace(/^v/, '');

      // Checkout files from tag
      const pluginDir = path.join(this.pluginsDir, pluginName);
      const relativePluginDir = path.relative(this.marketplaceRoot, pluginDir);

      execSync(`git checkout ${tag} -- ${relativePluginDir}`, { cwd: this.marketplaceRoot, stdio: 'pipe' });

      // Also update marketplace.json
      execSync(`git checkout ${tag} -- .claude-plugin/marketplace.json`, { cwd: this.marketplaceRoot, stdio: 'pipe' });

      console.log(`✅ Rolled back to ${tag}`);
      console.log('   Files restored from git');
      console.log('   Run git status to review changes');

      return { success: true, version, tag };
    } catch (error) {
      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  /**
   * Perform automatic rollback on error
   */
  performRollback() {
    try {
      // Restore files
      this.changes.files.forEach(({ path, old }) => {
        fs.writeFileSync(path, old, 'utf8');
      });

      // Delete tags
      this.changes.rollback.forEach(item => {
        if (item.type === 'tag') {
          try {
            execSync(`git tag -d ${item.value}`, { cwd: this.marketplaceRoot, stdio: 'pipe' });
          } catch (e) {
            // Tag might not exist
          }
        }
      });

      console.log('✅ Rollback complete');
    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
      console.log('   Manual intervention may be required');
    }
  }

  /**
   * Compare two versions
   */
  compareVersions(pluginName, version1, version2) {
    try {
      const pluginDir = path.join(this.pluginsDir, pluginName);
      const relativePluginDir = path.relative(this.marketplaceRoot, pluginDir);

      const diff = execSync(`git diff ${version1}..${version2} -- ${relativePluginDir}`, {
        cwd: this.marketplaceRoot,
        encoding: 'utf8'
      });

      return diff;
    } catch (error) {
      throw new Error(`Version comparison failed: ${error.message}`);
    }
  }

  /**
   * Get release notes from git commits
   */
  getReleaseNotes(pluginName, fromVersion) {
    try {
      const pluginDir = path.join(this.pluginsDir, pluginName);
      const relativePluginDir = path.relative(this.marketplaceRoot, pluginDir);

      const commits = execSync(
        `git log ${fromVersion}..HEAD --oneline --no-merges -- ${relativePluginDir}`,
        { cwd: this.marketplaceRoot, encoding: 'utf8' }
      );

      // Parse commits into categories
      const notes = {
        features: [],
        fixes: [],
        breaking: [],
        other: []
      };

      commits.split('\n').forEach(commit => {
        if (!commit.trim()) return;

        if (commit.includes('feat:') || commit.includes('feature:')) {
          notes.features.push(commit.replace(/.*?feat(ure)?:\s*/, ''));
        } else if (commit.includes('fix:')) {
          notes.fixes.push(commit.replace(/.*?fix:\s*/, ''));
        } else if (commit.includes('BREAKING')) {
          notes.breaking.push(commit.replace(/.*?BREAKING.*?:\s*/, ''));
        } else {
          notes.other.push(commit.replace(/^[a-f0-9]+\s+/, ''));
        }
      });

      return notes;
    } catch (error) {
      console.warn('Could not generate release notes from git:', error.message);
      return null;
    }
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node version-manager.js --plugin <name> [options]');
    console.log('\nOptions:');
    console.log('  --plugin <name>              Plugin name (required)');
    console.log('  --bump <major|minor|patch>   Bump version by type');
    console.log('  --version <version>          Set specific version');
    console.log('  --prerelease <suffix>        Add pre-release suffix (alpha.1, beta.1, rc.1)');
    console.log('  --promote                    Promote pre-release to production');
    console.log('  --rollback <tag>             Rollback to specific tag');
    console.log('  --message <msg>              Commit message');
    console.log('  --changelog                  Update CHANGELOG.md (default: true)');
    console.log('  --no-changelog               Skip CHANGELOG update');
    console.log('  --no-git                     Skip git operations');
    console.log('  --push                       Push changes to remote');
    console.log('  --dry-run                    Preview changes without applying');
    console.log('  --force                      Force non-sequential version');
    console.log('\nExamples:');
    console.log('  node version-manager.js --plugin my-plugin --bump patch --message "Bug fixes"');
    console.log('  node version-manager.js --plugin my-plugin --bump minor --push');
    console.log('  node version-manager.js --plugin my-plugin --prerelease beta.1');
    console.log('  node version-manager.js --plugin my-plugin --rollback v1.2.0');
    process.exit(1);
  }

  const options = {
    dryRun: args.includes('--dry-run'),
    noGit: args.includes('--no-git'),
    push: args.includes('--push'),
    force: args.includes('--force'),
    noRollback: args.includes('--no-rollback')
  };

  const pluginIndex = args.indexOf('--plugin');
  if (pluginIndex === -1) {
    console.error('Error: --plugin is required');
    process.exit(1);
  }

  const pluginName = args[pluginIndex + 1];

  const action = {};

  if (args.includes('--bump')) {
    action.bump = args[args.indexOf('--bump') + 1];
  }
  if (args.includes('--version')) {
    action.version = args[args.indexOf('--version') + 1];
  }
  if (args.includes('--prerelease')) {
    action.prerelease = args[args.indexOf('--prerelease') + 1];
  }
  if (args.includes('--promote')) {
    action.promote = true;
  }
  if (args.includes('--rollback')) {
    action.rollback = args[args.indexOf('--rollback') + 1];
  }
  if (args.includes('--message')) {
    action.message = args[args.indexOf('--message') + 1];
  }
  if (args.includes('--no-changelog')) {
    action.changelog = false;
  }

  const manager = new VersionManager(options);

  (async () => {
    try {
      const result = await manager.execute(pluginName, action);
      if (!options.dryRun) {
        console.log('\n📦 Release complete!');
        console.log('   Next steps:');
        if (!options.push) {
          console.log('   - Review changes: git status');
          console.log('   - Push to remote: git push origin main --tags');
        }
        console.log('   - Verify installation: /plugin update', pluginName);
      }
    } catch (error) {
      console.error('\n❌ Version management failed');
      process.exit(1);
    }
  })();
}

module.exports = VersionManager;
